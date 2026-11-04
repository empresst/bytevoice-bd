"""After the call: turn the transcript into structured, validated fields.

One LLM request returns JSON (intent, patient details, outcome, summaries and
an English translation of each line). Pydantic validates it; anything that
fails validation is dropped and recorded in validation_errors instead of
being stored as if it were true.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel, Field, field_validator

import db

logger = logging.getLogger("agent.extraction")
DHAKA = ZoneInfo("Asia/Dhaka")
MODEL = os.getenv("EXTRACTION_MODEL", "openai/gpt-oss-120b")

Outcome = Literal["booked", "rescheduled", "cancelled", "enquiry", "follow_up_needed", "incomplete", "failed", "spam"]


class Extraction(BaseModel):
    intent: Literal["book", "reschedule", "cancel", "enquiry", "other"]
    patient_name_bn: str | None = None
    patient_name_en: str | None = Field(None, description="Romanised spelling, e.g. 'Rahim Uddin'")
    phone: str | None = None
    reason_for_visit: str | None = None
    preferred_date_text: str | None = None
    preferred_datetime: str | None = Field(None, description="ISO 8601 in Asia/Dhaka")
    outcome: Outcome
    needs_human: bool = False
    is_spam: bool = False
    flags: list[Literal["spam", "abusive", "off_topic", "medical_advice_request", "emergency"]] = []
    sentiment: Literal["positive", "neutral", "negative"] | None = None
    confidence: float = Field(0.5, ge=0, le=1)
    summary_bn: str
    summary_en: str
    translations: dict[str, str] = Field(default_factory=dict, description="seq -> English")

    @field_validator("patient_name_en")
    @classmethod
    def latin_name(cls, v: str | None) -> str | None:
        return v if v is None or re.fullmatch(r"[A-Za-z .'-]{2,80}", v) else None


SYSTEM = """You read transcripts of phone calls to a dental clinic in Dhaka (Bangla, sometimes mixed with English)
and return ONE JSON object with exactly these keys:
intent, patient_name_bn, patient_name_en, phone, reason_for_visit, preferred_date_text, preferred_datetime,
outcome, needs_human, is_spam, flags, sentiment, confidence, summary_bn, summary_en, translations.

Rules:
- Only use what the caller actually said. Unknown -> null. Never guess a name or number.
- patient_name_bn in Bangla script; patient_name_en a sensible romanised spelling (e.g. "Md. Rahim Uddin").
- phone: digits exactly as the caller confirmed them (any script).
- reason_for_visit: short English, e.g. "toothache", "scaling", "follow-up".
- preferred_date_text: the caller's own words; preferred_datetime: ISO 8601 with +06:00, or null.
- outcome: one of booked, rescheduled, cancelled, enquiry, follow_up_needed, incomplete, failed, spam.
  Use follow_up_needed if staff must call back; incomplete if the caller left before finishing.
- is_spam/flags: prank, abuse, or a call with nothing to do with the clinic.
- summary_bn / summary_en: one or two sentences for the receptionist.
- translations: an object mapping each line's seq number (as a string) to a natural English translation.
"""


async def extract_and_store(call_id: str, tool_outcome: str | None, now: datetime) -> None:
    turns = await db.transcript(call_id)
    if not [t for t in turns if t["speaker"] == "caller"]:
        await db.save_extraction(call_id, {"intent": "other", "model": None, "raw": None,
                                            "validation_errors": ["no caller speech"]},
                                 "incomplete", [], "কলার কিছু বলেননি।", "Caller did not speak.", {})
        return

    lines = "\n".join(f"[{t['seq']}] {'AGENT' if t['speaker'] == 'agent' else 'CALLER'}: {t['text_bn']}" for t in turns)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"},
            json={
                "model": MODEL,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": f"Call date/time: {now:%Y-%m-%d %H:%M} Asia/Dhaka\n\n{lines}"},
                ],
            },
        )
        resp.raise_for_status()
    raw = json.loads(resp.json()["choices"][0]["message"]["content"])

    errors: list[str] = []
    try:
        x = Extraction.model_validate(raw)
    except Exception as e:  # keep what we can, record why the rest was dropped
        logger.warning("extraction failed validation: %s", e)
        errors.append(f"schema: {str(e)[:300]}")
        x = Extraction(intent="other", outcome="incomplete", summary_bn="", summary_en="")

    phone = await db.normalize_phone(x.phone) if x.phone else None
    if x.phone and not phone:
        errors.append(f"phone not a valid BD mobile: {x.phone!r}")

    when = None
    if x.preferred_datetime:
        try:
            when = datetime.fromisoformat(x.preferred_datetime)
            when = when if when.tzinfo else when.replace(tzinfo=DHAKA)
        except ValueError:
            errors.append(f"bad preferred_datetime: {x.preferred_datetime!r}")

    # What actually happened in the database beats what the model thinks happened.
    outcome = tool_outcome or ("spam" if x.is_spam else x.outcome)
    if outcome in ("booked", "rescheduled", "cancelled") and not tool_outcome:
        errors.append(f"model said {outcome} but no booking tool succeeded")
        outcome = "follow_up_needed" if x.needs_human else "incomplete"

    translations = {int(k): v for k, v in x.translations.items() if str(k).isdigit()}
    await db.save_extraction(
        call_id,
        {
            "intent": x.intent, "patient_name_bn": x.patient_name_bn, "patient_name_en": x.patient_name_en,
            "phone_e164": phone, "reason_for_visit": x.reason_for_visit,
            "preferred_date_text": x.preferred_date_text, "preferred_datetime": when,
            "needs_human": x.needs_human, "is_spam": x.is_spam, "sentiment": x.sentiment,
            "confidence": x.confidence, "validation_errors": errors, "model": MODEL, "raw": raw,
        },
        outcome, list(x.flags), x.summary_bn, x.summary_en, translations,
    )
    logger.info("extraction stored: outcome=%s errors=%d", outcome, len(errors))
