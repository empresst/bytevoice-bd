"""ByteVoice Bangladesh: Bangla voice receptionist for Rakib Dental Care.

Flow of one call:
  browser joins a LiveKit room -> this worker is dispatched -> a `calls` row is
  created -> every spoken line is stored in `transcript_turns` as it happens ->
  tools read/write appointments through Postgres functions -> when the call
  ends, the transcript is turned into validated fields in `call_extractions`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from datetime import date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    get_job_context,
)
from livekit.plugins import silero
from pydantic import Field

load_dotenv(".env.local")

import db  # noqa: E402  (needs env loaded first)
from bangla import DIGIT_WORDS, dhaka_words, say_datetime, say_phone, spoken_digits  # noqa: E402
from extraction import extract_and_store  # noqa: E402
from prompt import build_prompt  # noqa: E402
from voice import build_llm, build_stt, build_tts, dither_silence, restart_stalled_azure  # noqa: E402

logger = logging.getLogger("agent")

_background: set[asyncio.Task] = set()


def fire(coro) -> None:
    """Run a DB write in the background without blocking the conversation."""
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)
logging.basicConfig(level=logging.INFO)

DHAKA = ZoneInfo("Asia/Dhaka")
AGENT_NAME = os.getenv("AGENT_NAME", "bytevoice-bd")
MAX_CALL_SECONDS = int(os.getenv("MAX_CALL_DURATION_SECONDS", "300"))
# Same bands as bangla.part_of_day(), so a slot offered for "বিকাল" is also spoken as বিকাল.
PARTS_OF_DAY = {"morning": (0, 12), "noon": (12, 15), "afternoon": (15, 18), "evening": (18, 24)}
BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
# (min, max) seconds of silence before the caller's turn counts as finished.
NORMAL_PAUSE = (0.8, 3.0)
# What the website shows while a tool runs (avatar looks down), and the tools that change free slots.
TOOL_ACTIVITY = {"check_availability": "checking", "find_appointments": "checking",
                 "book_appointment": "booking", "reschedule_appointment": "booking", "cancel_appointment": "booking"}
SLOT_CHANGING_TOOLS = {"book_appointment", "reschedule_appointment", "cancel_appointment"}
# After the goodbye the line stays open this long; if the caller says anything, the
# hang-up is cancelled. Silence -> the agent hangs up (and closes the room).
HANGUP_GRACE = 4.0
# Recognition watchdog: speech this long with no transcript this long after it ends = a stall.
MIN_STALL_SPEECH = 1.0
STALL_WAIT = 2.5
PHONE_PAUSE = (2.0, 5.0)  # people read numbers in chunks: 01712 ... 345 ... 678

ServiceCode = Literal["checkup", "scaling", "filling", "root_canal", "extraction",
                      "braces_consult", "whitening", "child_checkup"]
DoctorCode = Literal["tanvir", "farhana", "nusrat"]



def hang_up(session: AgentSession, reason: str) -> None:
    """End the call for everyone: close the room now (the caller's browser shows
    "call ended" straight away instead of sitting in an empty room), then stop the
    agent. Saving and summarising the call runs afterwards in the shutdown callback."""
    job = get_job_context()
    job.delete_room()  # starts its own background task
    session.once("close", lambda _ev: job.shutdown(reason=reason))
    session.shutdown()

class CallQuality:
    """Turn-by-turn timings from LiveKit's per-message metrics, summarised per call."""

    def __init__(self) -> None:
        self.last_user_stop: float | None = None
        self.response, self.eot, self.ttft, self.ttfb = [], [], [], []
        self.interruptions = 0
        self.stt_restarts = 0  # Azure recognition stalled and was replaced by a fresh session
        self.llm_models: set[str] = set()
        self.tts_providers: set[str] = set()

    def record(self, role: str, m: dict, interrupted: bool) -> int | None:
        if role == "user":
            self.last_user_stop = m.get("stopped_speaking_at") or self.last_user_stop
            if m.get("end_of_turn_delay"):
                self.eot.append(m["end_of_turn_delay"])
            return None
        if interrupted:
            self.interruptions += 1
        if m.get("llm_node_ttft"):
            self.ttft.append(m["llm_node_ttft"])
        if m.get("tts_node_ttfb"):
            self.ttfb.append(m["tts_node_ttfb"])
        for key, bucket in (("llm_metadata", self.llm_models), ("tts_metadata", self.tts_providers)):
            meta = m.get(key) or {}
            name = (meta.get("model_name") if isinstance(meta, dict) else getattr(meta, "model_name", None)) \
                or (meta.get("model_provider") if isinstance(meta, dict) else getattr(meta, "model_provider", None))
            if name:
                bucket.add(str(name))
        started, stopped = m.get("started_speaking_at"), self.last_user_stop
        self.last_user_stop = None  # one response per caller turn
        if started and stopped and 0 < started - stopped < 20:
            ms = int((started - stopped) * 1000)
            self.response.append(ms)
            logger.info("LATENCY caller-stopped -> agent-speaking: %d ms", ms)
            return ms
        return None

    def summary(self) -> dict:
        avg = lambda xs: int(sum(xs) / len(xs) * (1 if xs is self.response else 1000)) if xs else None  # noqa: E731
        return {
            "turns": len(self.response),
            "avg_response_ms": avg(self.response),
            "max_response_ms": max(self.response) if self.response else None,
            "avg_end_of_turn_ms": avg(self.eot),
            "avg_llm_first_token_ms": avg(self.ttft),
            "avg_tts_first_audio_ms": avg(self.ttfb),
            "interruptions": self.interruptions,
            "stt_restarts": self.stt_restarts,
            "llm_models": sorted(self.llm_models),
            "tts_providers": sorted(self.tts_providers),
        }


class CallState:
    """Per-call bookkeeping shared by the tools and the session hooks."""

    def __init__(self, call_id: str) -> None:
        self.call_id = call_id
        self.started = time.monotonic()
        self.seq = 0
        self.outcome: str | None = None  # set only when a booking tool really succeeded
        self.quality = CallQuality()
        self.end_reason = "caller_hangup"
        self.collecting_phone = False
        self.phone_confirmed = False
        self.phone_digits = ""  # parts of the number heard so far
        self.phone_partials = 0
        self.phone_invalid = 0


class Receptionist(Agent):
    def __init__(self, instructions: str, state: CallState, doctor_ids: dict[str, str]) -> None:
        super().__init__(instructions=instructions)
        self.state = state
        self.doctor_ids = doctor_ids
        self.last_spoke = 0.0
        self.slot_changes = 0
        self.hangup_token: object | None = None  # set while a hang-up is pending after the goodbye

    def phone_mode(self, on: bool) -> None:
        """While collecting the number: longer pauses, so a caller reading it out in
        groups isn't cut off. Recognition stays bn-BD (it handles numbers spoken in
        Bangla, English or mixed; spoken_digits() turns the words into digits)."""
        if on == self.state.collecting_phone:
            return
        self.state.collecting_phone = on
        pause = PHONE_PAUSE if on else NORMAL_PAUSE
        self.session.update_options(min_endpointing_delay=pause[0], max_endpointing_delay=pause[1])
        logger.info("phone mode %s", "on" if on else "off")

    @function_tool()
    async def end_call(self, context: RunContext) -> None:
        """End the call. Say your Bangla goodbye BEFORE calling this; nothing is spoken after it.
        The line stays open a few seconds in case the caller still says something."""
        token = self.hangup_token = object()

        async def after_grace() -> None:
            await asyncio.sleep(HANGUP_GRACE)
            if self.hangup_token is token:  # the caller stayed quiet
                self.state.end_reason = "agent_goodbye"
                hang_up(self.session, "agent_goodbye")

        # Start the grace period once the goodbye has finished playing.
        context.speech_handle.add_done_callback(lambda _: fire(after_grace()))
        return None  # no reply: the goodbye was already said

    def cancel_hangup(self) -> None:
        """The caller spoke after the goodbye: stay on the line and carry on."""
        if self.hangup_token is not None:
            self.hangup_token = None
            logger.info("caller spoke after the goodbye; staying on the line")

    async def stt_node(self, audio, model_settings):
        """Caller audio -> speech recognition, with exact-silence frames dithered (see dither_silence)."""
        async def dithered():
            async for frame in audio:
                yield dither_silence(frame)

        async for ev in Agent.default.stt_node(self, dithered(), model_settings):
            yield ev

    async def on_enter(self) -> None:
        await self.session.say(
            "আসসালামু আলাইকুম, রাকিব ডেন্টাল কেয়ার থেকে বলছি। বলুন, আপনাকে কীভাবে সাহায্য করতে পারি?",
            allow_interruptions=True,
        )

    def _ack(self, kind: str) -> None:
        """Say a short "one moment" right away so the wait for the database and the
        second LLM step doesn't feel like silence. Not added to the chat history."""
        phrases = {
            "check": ["জি, একটু দেখছি।", "এক সেকেন্ড, দেখে নিচ্ছি।", "জি, দেখছি।"],
            "book": ["জি, বুক করছি।", "এক সেকেন্ড, করে দিচ্ছি।"],
            "find": ["জি, খুঁজে দেখছি।", "এক সেকেন্ড, দেখছি।"],
        }[kind]
        if time.monotonic() - self.last_spoke < 3:
            return  # the model already said something like "দেখছি" this turn
        self.session.say(random.choice(phrases), add_to_chat_ctx=False, allow_interruptions=True)

    async def _run(self, name: str, args: dict, coro) -> dict:
        """Run a tool, log it to tool_invocations, never raise into the LLM."""
        t0 = time.perf_counter()
        activity = TOOL_ACTIVITY.get(name)
        if activity:
            fire(self._signal({"bv.activity": activity}))
        try:
            result = await asyncio.wait_for(coro, timeout=8)
            ok = bool(result.get("ok", True)) if isinstance(result, dict) else True
        except Exception as e:
            logger.exception("tool %s failed", name)
            result, ok = {"ok": False, "error": "system_error",
                          "say": "দুঃখিত, সিস্টেমে একটু সমস্যা হচ্ছে। আমি কি আমাদের টিমকে আপনাকে ফোন করতে বলবো?"}, False
            _ = e
        ms = int((time.perf_counter() - t0) * 1000)
        fire(db.log_tool(self.state.call_id, name, args, result, ok, ms))
        done = {"bv.activity": ""} if activity else {}
        if ok and name in SLOT_CHANGING_TOOLS:
            self.slot_changes += 1
            done["bv.slots"] = str(self.slot_changes)  # the website's slot board reloads on change
        if done:
            fire(self._signal(done))
        return result

    async def _signal(self, attrs: dict[str, str]) -> None:
        """Tell the website what the agent is doing (participant attributes: the
        avatar looks down while checking/booking; the slot board reloads after a
        booking change). A few bytes over the call's existing connection."""
        try:
            await get_job_context().room.local_participant.set_attributes(attrs)
        except Exception:
            logger.debug("could not set participant attributes %s", attrs, exc_info=True)

    # ------------------------------------------------------------------ tools

    @function_tool()
    async def check_availability(
        self,
        context: RunContext,
        date_iso: Annotated[str, Field(description="Date as YYYY-MM-DD, resolved from the calendar in your instructions")],
        service_code: ServiceCode,
        part_of_day: Annotated[Literal["any", "morning", "noon", "afternoon", "evening"], Field(description="morning=সকাল (before 12), noon=দুপুর (12-3), afternoon=বিকাল/বিকেল (3-6), evening=সন্ধ্যা/রাত (after 6)")] = "any",
        preferred_time: Annotated[str | None, Field(description="HH:MM 24h if the caller named a time, e.g. 16:00 for বিকাল চারটা. Call again whenever they ask for a different time.")] = None,
        doctor: Annotated[DoctorCode | None, Field(description="ONLY if the caller named a doctor. Otherwise leave empty to search all doctors.")] = None,
    ) -> dict:
        """Find free appointment times on one day for a service, across all doctors unless one was requested."""
        self._ack("check")
        async def go() -> dict:
            try:
                day = date.fromisoformat(date_iso)
            except ValueError:
                return {"ok": False, "error": "bad_date"}
            if day < datetime.now(DHAKA).date():
                return {"ok": False, "error": "date_in_past"}
            if day.weekday() == 4:
                return {"ok": False, "error": "closed_friday", "say": "শুক্রবার ক্লিনিক বন্ধ থাকে।"}
            rows = await db.available_slots(day, service_code, None)
            code_of = {v: k for k, v in self.doctor_ids.items()}
            lo, hi = PARTS_OF_DAY.get(part_of_day, (0, 24))
            local = [(r, r["starts_at"].astimezone(DHAKA)) for r in rows]
            none_in_part = False
            if part_of_day != "any" and not preferred_time:
                in_part = [(r, t) for r, t in local if lo <= t.hour < hi]
                if in_part:
                    local = in_part
                else:  # nothing then: offer the closest times that day instead of an empty list
                    none_in_part = bool(local)
                    local.sort(key=lambda x: min(abs(x[1].hour - lo), abs(x[1].hour - (hi - 1))))
            if preferred_time:
                try:
                    hh, mm = map(int, preferred_time.split(":"))
                    want = hh * 60 + mm
                    local.sort(key=lambda x: abs(x[1].hour * 60 + x[1].minute - want))
                except ValueError:
                    pass
            if doctor:  # requested doctor first, others after as alternatives
                local.sort(key=lambda x: code_of.get(str(x[0]["doctor_id"])) != doctor)
            slots = [{"say": say_datetime(t), "doctor_name": r["doctor_name_bn"],
                      "doctor": code_of.get(str(r["doctor_id"])), "starts_at": r["starts_at"].isoformat(),
                      "exact_match": bool(preferred_time) and f"{t:%H:%M}" == preferred_time}
                     for r, t in local[:5]]
            note = "Offer 2-3 (exact_match first). Pass starts_at and doctor unchanged to book_appointment."
            if none_in_part:
                note = "Nothing free in the part of day the caller asked for; say so, then offer these nearest times. " + note
            return {"ok": True, "count": len(local), "slots": slots, "none_in_requested_part": none_in_part, "note": note}
        return await self._run("check_availability", {"date": date_iso, "service": service_code, "part_of_day": part_of_day,
                                                      "preferred_time": preferred_time, "doctor": doctor}, go())

    @function_tool()
    async def confirm_phone(
        self,
        context: RunContext,
        spoken: Annotated[str, Field(description="The caller's latest words for their phone number, copied EXACTLY as they said them (Bangla, English or mixed, e.g. 'জিরো ওয়ান সেভেন', 'শূন্য এক', 'double one'). Do not convert to digits. Never invent a number.")],
    ) -> dict:
        """Collect the caller's mobile number. Call it every time they say part of it; the parts are joined automatically."""
        async def go() -> dict:
            chunk = spoken_digits(spoken)
            buf = self.state.phone_digits
            # A part that starts like a mobile number ("01…", "8801…") is a fresh attempt.
            buf = chunk if chunk.startswith(("01", "8801")) or not buf else buf + chunk
            if buf.startswith("880"):
                buf = "0" + buf[3:]

            def wrong(say: str) -> dict:
                self.state.phone_digits = ""
                self.state.phone_partials = 0
                self.state.phone_invalid += 1
                if self.state.phone_invalid >= 3:  # three tries, then offer a callback instead of looping
                    return {"ok": False, "error": "invalid_phone",
                            "say": "দুঃখিত, নম্বরটা ঠিকমতো ধরতে পারছি না। আপনি চাইলে আমাদের টিম আপনাকে ফোন করে appointment ঠিক করে দেবে।",
                            "note": "Offer request_callback; do not ask for the number again."}
                return {"ok": False, "error": "invalid_phone", "say": say}

            # Bangladeshi mobiles: 01, then 3-9, then 8 digits (11 in total). Catch mistakes as soon as they are heard.
            if (len(buf) >= 1 and buf[0] != "0") or (len(buf) >= 2 and buf[1] != "1"):
                return wrong("নম্বরটা ঠিক মনে হচ্ছে না। বাংলাদেশের মোবাইল নম্বর শূন্য এক দিয়ে শুরু হয়। আরেকবার বলবেন?")
            if len(buf) >= 3 and buf[2] not in "3456789":
                return wrong("নম্বরটা ঠিক মনে হচ্ছে না। শূন্য এক-এর পরে তিন থেকে নয়ের মধ্যে কোনো অংক হয়। পুরো নম্বরটা আরেকবার বলবেন?")
            if len(buf) > 11:
                return wrong("নম্বরে এগারোটার বেশি অংক হয়ে গেছে। পুরো নম্বরটা আরেকবার বলবেন?")
            self.state.phone_digits = buf
            if len(buf) < 11:
                self.state.phone_partials += 1
                if self.state.phone_partials != 2:  # read back what we have only once
                    return {"ok": False, "error": "incomplete", "say": "জি",
                            "note": "Number not finished. Say only 'জি' and wait for the rest."}
                heard = " ".join(DIGIT_WORDS[int(d)] for d in buf)
                return {"ok": False, "error": "incomplete",
                        "say": f"এখন পর্যন্ত পেয়েছি {heard}। বাকিটা বলুন, অথবা পুরো নম্বরটা আবার বলুন।"}
            e164 = await db.normalize_phone(buf)
            self.state.phone_digits = ""
            self.state.phone_partials = 0
            if not e164:
                return wrong("নম্বরটা ঠিক মিলছে না। এগারো অংকের মোবাইল নম্বরটা আরেকবার বলবেন?")
            self.state.phone_confirmed = True
            self.phone_mode(False)
            return {"ok": True, "phone_e164": e164, "say_phone": say_phone(e164),
                    "note": "Read say_phone back and ask if it is correct. If the caller says it is wrong, ask again."}
        return await self._run("confirm_phone", {"spoken": spoken}, go())

    @function_tool()
    async def book_appointment(
        self,
        context: RunContext,
        patient_name_bn: Annotated[str, Field(description="Full name in Bangla script, as confirmed by the caller")],
        patient_name_en: Annotated[str, Field(description="Same name romanised, e.g. 'Rahim Uddin'")],
        phone: Annotated[str, Field(description="Confirmed mobile number")],
        service_code: ServiceCode,
        doctor: DoctorCode,
        starts_at: Annotated[str, Field(description="starts_at exactly as returned by check_availability")],
        notes: Annotated[str | None, Field(description="Reason or symptoms, short")] = None,
    ) -> dict:
        """Book the appointment. Only call after the caller said yes to the full summary."""
        self._ack("book")
        async def go() -> dict:
            r = await db.book(self.state.call_id, patient_name_bn, patient_name_en, phone, service_code,
                              self.doctor_ids[doctor], datetime.fromisoformat(starts_at), notes)
            if r.get("ok"):
                self.state.outcome = "booked"
                r["say"] = say_datetime(datetime.fromisoformat(str(r["starts_at"])).astimezone(DHAKA))
            return r
        return await self._run("book_appointment", {"name_bn": patient_name_bn, "name_en": patient_name_en,
                                                    "phone": phone, "service": service_code,
                                                    "doctor": doctor, "starts_at": starts_at}, go())

    @function_tool()
    async def find_appointments(
        self,
        context: RunContext,
        phone: Annotated[str, Field(description="Mobile number the appointment was booked with")],
    ) -> dict:
        """Look up the caller's upcoming appointments by phone number."""
        self._ack("find")
        async def go() -> dict:
            appts = await db.find_appointments(phone)
            for a in appts:
                a["say"] = say_datetime(datetime.fromisoformat(a["starts_at"]).astimezone(DHAKA))
            return {"ok": True, "appointments": appts}
        return await self._run("find_appointments", {"phone": phone}, go())

    @function_tool()
    async def reschedule_appointment(
        self,
        context: RunContext,
        appointment_id: str,
        phone: str,
        new_starts_at: Annotated[str, Field(description="starts_at from check_availability for the SAME doctor and service")],
    ) -> dict:
        """Move an existing appointment to a new time. Confirm with the caller first."""
        self._ack("book")
        async def go() -> dict:
            r = await db.reschedule(appointment_id, phone, datetime.fromisoformat(new_starts_at), self.state.call_id)
            if r.get("ok"):
                self.state.outcome = "rescheduled"
                r["say"] = say_datetime(datetime.fromisoformat(new_starts_at).astimezone(DHAKA))
            return r
        return await self._run("reschedule_appointment", {"appointment_id": appointment_id, "phone": phone,
                                                          "new_starts_at": new_starts_at}, go())

    @function_tool()
    async def cancel_appointment(
        self,
        context: RunContext,
        appointment_id: str,
        phone: str,
        reason: Annotated[str | None, Field(description="Only if the caller already said why. Never ask for a reason.")] = None,
    ) -> dict:
        """Cancel an appointment as soon as the caller confirms which one. Do not ask why."""
        self._ack("book")
        async def go() -> dict:
            r = await db.cancel(appointment_id, phone, self.state.call_id, reason)
            if r.get("ok"):
                self.state.outcome = "cancelled"
            return r
        return await self._run("cancel_appointment", {"appointment_id": appointment_id, "phone": phone,
                                                      "reason": reason}, go())

    @function_tool()
    async def request_callback(
        self,
        context: RunContext,
        category: Literal["medical_question", "complaint", "billing", "emergency", "other"],
        reason: Annotated[str, Field(description="One line for staff, in English")],
        phone: str | None = None,
    ) -> dict:
        """Record a request that a human at the clinic must follow up on."""
        async def go() -> dict:
            await db.add_callback(self.state.call_id, category, reason, phone)
            if self.state.outcome is None:
                self.state.outcome = "follow_up_needed"
            return {"ok": True}
        return await self._run("request_callback", {"category": category, "reason": reason, "phone": phone}, go())

    # Clean up Kolkata words before anything is spoken.
    async def tts_node(self, text, model_settings):
        async def fixed():
            said = ""
            async for chunk in text:
                self.last_spoke = time.monotonic()
                said += chunk
                if "নম্বর" in said and not self.state.phone_confirmed:
                    self.phone_mode(True)
                yield dhaka_words(chunk)
        return Agent.default.tts_node(self, fixed(), model_settings)


server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    call_id = await db.start_call(ctx.room.name, ctx.job.id)
    state = CallState(call_id)
    profile = await db.clinic_profile()
    now = datetime.now(DHAKA)

    stt_chain, azure_stt = build_stt()
    session = AgentSession(
        stt=stt_chain,
        llm=build_llm(),
        tts=build_tts(),
        vad=ctx.proc.userdata["vad"],
        # Wait for a real pause before answering: Bangla speakers often pause mid-sentence.
        turn_detection="vad",
        min_endpointing_delay=NORMAL_PAUSE[0],
        max_endpointing_delay=NORMAL_PAUSE[1],
        # Start drafting the reply while we confirm the caller has finished (discarded if they keep talking).
        preemptive_generation=True,
        # Ignore "hmm"/"জি" while the agent talks; only real interruptions stop it.
        min_interruption_duration=0.6,
        min_interruption_words=2,
        user_away_timeout=12,
    )

    # --- transcript, saved line by line so the portal can show a live call
    @session.on("conversation_item_added")
    def on_item(ev) -> None:
        item = ev.item
        role = getattr(item, "role", None)
        text = (getattr(item, "text_content", None) or "").strip()
        if role not in ("user", "assistant") or not text:
            return
        m = getattr(item, "metrics", None) or {}
        interrupted = bool(getattr(item, "interrupted", False))
        response_ms = state.quality.record(role, m, interrupted)
        state.seq += 1
        offset = int((time.monotonic() - state.started) * 1000)
        fire(db.add_turn(call_id, state.seq, "caller" if role == "user" else "agent",
                         text, offset, interrupted, response_ms))

    # --- recognition watchdog: the voice detector heard the caller, but no text came back.
    # A stalled recogniser raises no error, so the FallbackAdapter can't see it; we replace the
    # Azure session and ask the caller to repeat. Only event bookkeeping on the normal path.
    heard = {"speech_start": 0.0, "last_text": 0.0, "agent_spoke": False}
    stalls = 0

    @session.on("user_input_transcribed")
    def on_transcript(ev) -> None:
        heard["last_text"] = time.monotonic()

    @session.on("agent_state_changed")
    def on_agent_state(ev) -> None:
        if ev.new_state == "speaking":
            heard["agent_spoke"] = True

    async def check_stall(speech_start: float) -> None:
        nonlocal stalls
        await asyncio.sleep(STALL_WAIT)
        if heard["last_text"] >= speech_start or heard["speech_start"] != speech_start:
            return  # text arrived, or the caller is already speaking again
        stalls += 1
        restarted = restart_stalled_azure(azure_stt)
        state.quality.stt_restarts += int(restarted)
        logger.warning("speech heard but no transcript (stall %d)%s", stalls,
                       "; restarted the Azure session" if restarted else "")
        if stalls <= 2:
            session.say("দুঃখিত, আবার একটু বলবেন?", allow_interruptions=True)

    @session.on("user_state_changed")
    def on_user_state(ev) -> None:
        now_t = time.monotonic()
        if ev.new_state == "speaking":
            heard["speech_start"], heard["agent_spoke"] = now_t, False
            agent = session.current_agent
            if isinstance(agent, Receptionist):
                agent.cancel_hangup()
        # Skip short sounds (cough, "হুঁ") and anything said over the agent (echo, backchannel).
        elif (ev.old_state == "speaking" and ev.new_state == "listening"
              and now_t - heard["speech_start"] >= MIN_STALL_SPEECH and not heard["agent_spoke"]):
            fire(check_stall(heard["speech_start"]))
        if ev.new_state == "away":
            fire(handle_silence())

    silence_prompts = 0

    async def handle_silence() -> None:
        nonlocal silence_prompts
        silence_prompts += 1
        if silence_prompts == 1:
            await session.say("হ্যালো, আপনি কি শুনতে পাচ্ছেন?")
        else:
            state.end_reason = "silence"
            await session.say("মনে হচ্ছে লাইনে সমস্যা হচ্ছে। পরে আবার ফোন করবেন। আল্লাহ হাফেজ।")
            hang_up(session, "silence")

    async def call_cap() -> None:
        await asyncio.sleep(MAX_CALL_SECONDS)
        state.end_reason = "time_limit"
        await session.say("দুঃখিত, এই ডেমো কলের সময় শেষ হয়ে গেছে। ধন্যবাদ, আল্লাহ হাফেজ।")
        hang_up(session, "time_limit")

    cap = asyncio.create_task(call_cap())

    async def finish() -> None:
        cap.cancel()
        q = state.quality.summary()
        try:
            await asyncio.sleep(0.5)  # let the last transcript writes land
            await db.end_call(call_id, state.end_reason, q)
            await extract_and_store(call_id, state.outcome, now)
        except Exception:
            logger.exception("post-call processing failed")
            await db.mark_failed(call_id, "post_call_error")

    ctx.add_shutdown_callback(finish)

    doctor_ids = {d["code"]: str(d["id"]) for d in profile["doctors"]}
    await session.start(agent=Receptionist(build_prompt(profile, now), state, doctor_ids), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(server)
