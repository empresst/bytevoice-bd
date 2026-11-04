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
)
from livekit.agents.beta.tools import EndCallTool
from livekit.plugins import silero
from pydantic import Field

load_dotenv(".env.local")

import db  # noqa: E402  (needs env loaded first)
from bangla import dhaka_words, say_datetime, say_phone, spoken_digits  # noqa: E402
from extraction import extract_and_store  # noqa: E402
from prompt import build_prompt  # noqa: E402
from voice import build_llm, build_stt, build_tts  # noqa: E402

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
PARTS_OF_DAY = {"morning": (0, 12), "afternoon": (12, 17), "evening": (17, 24)}
BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
# (min, max) seconds of silence before the caller's turn counts as finished.
NORMAL_PAUSE = (0.8, 3.0)
PHONE_PAUSE = (2.0, 5.0)  # people read numbers in chunks: 01712 ... 345 ... 678

ServiceCode = Literal["checkup", "scaling", "filling", "root_canal", "extraction",
                      "braces_consult", "whitening", "child_checkup"]
DoctorCode = Literal["tanvir", "farhana", "nusrat"]


class CallState:
    """Per-call bookkeeping shared by the tools and the session hooks."""

    def __init__(self, call_id: str) -> None:
        self.call_id = call_id
        self.started = time.monotonic()
        self.seq = 0
        self.outcome: str | None = None  # set only when a booking tool really succeeded
        self.latencies: list[float] = []
        self.end_reason = "caller_hangup"
        self.collecting_phone = False
        self.phone_confirmed = False
        self.phone_digits = ""  # parts of the number heard so far


class Receptionist(Agent):
    def __init__(self, instructions: str, state: CallState, doctor_ids: dict[str, str]) -> None:
        super().__init__(
            instructions=instructions,
            tools=[EndCallTool(end_instructions="ভদ্রভাবে বিদায় নাও", ignore_on_enter=True)],
        )
        self.state = state
        self.doctor_ids = doctor_ids

    async def on_enter(self) -> None:
        await self.session.say(
            "আসসালামু আলাইকুম, রাকিব ডেন্টাল কেয়ার থেকে বলছি। বলুন, আপনাকে কীভাবে সাহায্য করতে পারি?",
            allow_interruptions=True,
        )

    async def _run(self, name: str, args: dict, coro) -> dict:
        """Run a tool, log it to tool_invocations, never raise into the LLM."""
        t0 = time.perf_counter()
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
        return result

    # ------------------------------------------------------------------ tools

    @function_tool()
    async def check_availability(
        self,
        context: RunContext,
        date_iso: Annotated[str, Field(description="Date as YYYY-MM-DD, resolved from the calendar in your instructions")],
        service_code: ServiceCode,
        part_of_day: Annotated[Literal["any", "morning", "afternoon", "evening"], Field(description="morning=সকাল, afternoon=দুপুর/বিকাল, evening=সন্ধ্যা/রাত")] = "any",
        preferred_time: Annotated[str | None, Field(description="HH:MM 24h if the caller named a time, e.g. 16:00 for বিকাল চারটা. Call again whenever they ask for a different time.")] = None,
        doctor: Annotated[DoctorCode | None, Field(description="ONLY if the caller named a doctor. Otherwise leave empty to search all doctors.")] = None,
    ) -> dict:
        """Find free appointment times on one day for a service, across all doctors unless one was requested."""
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
            if part_of_day != "any" and not preferred_time:
                local = [(r, t) for r, t in local if lo <= t.hour < hi]
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
            return {"ok": True, "count": len(local), "slots": slots,
                    "note": "Offer 2-3 (exact_match first). Pass starts_at and doctor unchanged to book_appointment."}
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
            if len(chunk) >= 11 or (chunk.startswith("01") and len(buf) + len(chunk) > 11) or len(buf) + len(chunk) > 13:
                buf = chunk                      # a fresh full attempt replaces what we had
            else:
                buf += chunk
            if buf.startswith("880"):
                buf = "0" + buf[3:]
            self.state.phone_digits = buf
            if len(buf) < 11:
                return {"ok": False, "error": "incomplete", "digits_so_far": len(buf),
                        "say": "জি", "note": "Number not finished. Say only 'জি' and wait for the rest."}
            e164 = await db.normalize_phone(buf)
            self.state.phone_digits = ""
            if not e164:
                return {"ok": False, "error": "invalid_phone",
                        "say": "নম্বরটা ঠিক মিলছে না। এগারো অংকের মোবাইল নম্বরটা আরেকবার বলবেন? আস্তে আস্তে বললেও হবে।"}
            self.state.collecting_phone = False
            self.state.phone_confirmed = True
            self.session.update_options(min_endpointing_delay=NORMAL_PAUSE[0], max_endpointing_delay=NORMAL_PAUSE[1])
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
        reason: str | None = None,
    ) -> dict:
        """Cancel an appointment. Confirm with the caller first."""
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
            async for chunk in text:
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

    session = AgentSession(
        stt=build_stt(),
        llm=build_llm(),
        tts=build_tts(),
        vad=ctx.proc.userdata["vad"],
        # Wait for a real pause before answering: Bangla speakers often pause mid-sentence.
        turn_detection="vad",
        min_endpointing_delay=NORMAL_PAUSE[0],
        max_endpointing_delay=NORMAL_PAUSE[1],
        # Don't start the LLM before the caller finishes; it doubles requests on Groq's free limits.
        preemptive_generation=False,
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
        # The agent just asked for the phone number (and hasn't confirmed one yet).
        if role == "assistant" and "নম্বর" in text and "?" in text and not state.phone_confirmed and not state.collecting_phone:
            state.collecting_phone = True
            session.update_options(min_endpointing_delay=PHONE_PAUSE[0], max_endpointing_delay=PHONE_PAUSE[1])
        state.seq += 1
        offset = int((time.monotonic() - state.started) * 1000)
        fire(db.add_turn(call_id, state.seq, "caller" if role == "user" else "agent",
                                        text, offset, bool(getattr(item, "interrupted", False))))

    # --- latency: caller stops talking -> agent starts talking
    user_stopped: list[float] = []

    @session.on("user_state_changed")
    def on_user_state(ev) -> None:
        if ev.old_state == "speaking":
            user_stopped[:] = [time.perf_counter()]
        if ev.new_state == "away":
            fire(handle_silence())

    @session.on("agent_state_changed")
    def on_agent_state(ev) -> None:
        if ev.new_state == "speaking" and user_stopped:
            ms = (time.perf_counter() - user_stopped.pop()) * 1000
            state.latencies.append(ms)
            logger.info("LATENCY user-stopped -> agent-speaking: %.0f ms", ms)

    silence_prompts = 0

    async def handle_silence() -> None:
        nonlocal silence_prompts
        silence_prompts += 1
        if silence_prompts == 1:
            await session.say("হ্যালো, আপনি কি শুনতে পাচ্ছেন?")
        else:
            state.end_reason = "silence"
            await session.say("মনে হচ্ছে লাইনে সমস্যা হচ্ছে। পরে আবার ফোন করবেন। আল্লাহ হাফেজ।")
            session.shutdown()

    async def call_cap() -> None:
        await asyncio.sleep(MAX_CALL_SECONDS)
        state.end_reason = "time_limit"
        await session.say("দুঃখিত, এই ডেমো কলের সময় শেষ হয়ে গেছে। ধন্যবাদ, আল্লাহ হাফেজ।")
        session.shutdown()

    cap = asyncio.create_task(call_cap())

    async def finish() -> None:
        cap.cancel()
        avg = int(sum(state.latencies) / len(state.latencies)) if state.latencies else None
        try:
            await asyncio.sleep(0.5)  # let the last transcript writes land
            await db.end_call(call_id, state.end_reason, avg)
            await extract_and_store(call_id, state.outcome, now)
        except Exception:
            logger.exception("post-call processing failed")
            await db.mark_failed(call_id, "post_call_error")

    ctx.add_shutdown_callback(finish)

    doctor_ids = {d["code"]: str(d["id"]) for d in profile["doctors"]}
    await session.start(agent=Receptionist(build_prompt(profile, now), state, doctor_ids), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(server)
