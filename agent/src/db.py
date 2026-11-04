"""Database access for the agent.

One small asyncpg pool per worker process. All booking rules live in Postgres
functions (see supabase/migrations), so this module only calls them and
records what happened on the call.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import date, datetime
from typing import Any

import asyncpg

logger = logging.getLogger("agent.db")

CLINIC_ID = os.getenv("CLINIC_ID", "0b7e5c3a-1d2f-4a6b-9c8d-000000000001")

_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _lock:
            if _pool is None:
                # statement_cache_size=0: required behind Supabase's pooler.
                _pool = await asyncpg.create_pool(
                    os.environ["DATABASE_URL"], min_size=1, max_size=4,
                    statement_cache_size=0, command_timeout=8,
                )
    return _pool


async def close() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _json(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


# --- clinic data -------------------------------------------------------------

async def clinic_profile() -> dict[str, Any]:
    p = await pool()
    clinic = await p.fetchrow("select * from clinics where id = $1", CLINIC_ID)
    doctors = await p.fetch(
        "select id, full_name_bn, full_name_en, specialty_bn from doctors where clinic_id = $1 and active order by full_name_en",
        CLINIC_ID,
    )
    services = await p.fetch(
        "select code, name_bn, name_en, duration_min, fee_bdt, prep_notes_bn from services where clinic_id = $1 and active order by fee_bdt",
        CLINIC_ID,
    )
    return {
        "clinic": dict(clinic) | {"info": _json(clinic["info"])},
        # short code (first name) instead of a UUID: fewer tokens, and the model can't garble it
        "doctors": [dict(d) | {"code": d["full_name_en"].split()[1].lower()} for d in doctors],
        "services": [dict(s) for s in services],
    }


async def available_slots(day: date, service_code: str, doctor_id: str | None) -> list[asyncpg.Record]:
    p = await pool()
    return await p.fetch(
        "select doctor_id, doctor_name_bn, starts_at from available_slots($1, $2, $3, $4)",
        CLINIC_ID, day, service_code, doctor_id,
    )


async def book(call_id: str, name_bn: str, name_en: str, phone: str, service_code: str,
               doctor_id: str, starts_at: datetime, notes: str | None) -> dict[str, Any]:
    p = await pool()
    return _json(await p.fetchval(
        "select book_appointment($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        CLINIC_ID, call_id, name_bn, name_en, phone, service_code, doctor_id, starts_at, notes,
    ))


async def find_appointments(phone: str) -> list[dict[str, Any]]:
    p = await pool()
    return _json(await p.fetchval("select find_appointments($1, $2)", CLINIC_ID, phone))


async def reschedule(appointment_id: str, phone: str, new_start: datetime, call_id: str) -> dict[str, Any]:
    p = await pool()
    return _json(await p.fetchval(
        "select reschedule_appointment($1, $2, $3, $4)", appointment_id, phone, new_start, call_id,
    ))


async def cancel(appointment_id: str, phone: str, call_id: str, reason: str | None) -> dict[str, Any]:
    p = await pool()
    return _json(await p.fetchval(
        "select cancel_appointment($1, $2, $3, $4)", appointment_id, phone, call_id, reason,
    ))


async def normalize_phone(raw: str) -> str | None:
    p = await pool()
    return await p.fetchval("select normalize_bd_phone($1)", raw)


async def add_callback(call_id: str, category: str, reason: str, phone: str | None) -> None:
    p = await pool()
    await p.execute(
        "insert into callbacks (clinic_id, call_id, category, reason, phone_e164) values ($1, $2, $3, $4, normalize_bd_phone($5))",
        CLINIC_ID, call_id, category, reason, phone,
    )


# --- call records ------------------------------------------------------------

async def start_call(room: str, job_id: str) -> str:
    p = await pool()
    return str(await p.fetchval(
        "insert into calls (clinic_id, livekit_room, livekit_job_id) values ($1, $2, $3) returning id",
        CLINIC_ID, room, job_id,
    ))


async def add_turn(call_id: str, seq: int, speaker: str, text: str, offset_ms: int, interrupted: bool) -> None:
    p = await pool()
    await p.execute(
        "insert into transcript_turns (call_id, seq, speaker, text_bn, offset_ms, interrupted) values ($1, $2, $3, $4, $5, $6)",
        call_id, seq, speaker, text, offset_ms, interrupted,
    )


async def log_tool(call_id: str, name: str, args: dict, result: Any, ok: bool, duration_ms: int) -> None:
    p = await pool()
    await p.execute(
        "insert into tool_invocations (call_id, tool_name, args, result, ok, duration_ms) values ($1, $2, $3::jsonb, $4::jsonb, $5, $6)",
        call_id, name, json.dumps(args, default=str, ensure_ascii=False),
        json.dumps(result, default=str, ensure_ascii=False), ok, duration_ms,
    )


async def end_call(call_id: str, end_reason: str, avg_latency_ms: int | None) -> None:
    p = await pool()
    await p.execute(
        "update calls set ended_at = now(), status = 'ended', end_reason = $2, avg_latency_ms = $3 where id = $1",
        call_id, end_reason, avg_latency_ms,
    )


async def transcript(call_id: str) -> list[asyncpg.Record]:
    p = await pool()
    return await p.fetch(
        "select seq, speaker, text_bn from transcript_turns where call_id = $1 order by seq", call_id,
    )


async def save_extraction(call_id: str, data: dict[str, Any], outcome: str, flags: list[str],
                          summary_bn: str | None, summary_en: str | None,
                          translations: dict[int, str]) -> None:
    p = await pool()
    async with p.acquire() as c, c.transaction():
        await c.execute(
            """insert into call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_e164,
                   reason_for_visit, preferred_date_text, preferred_datetime, outcome, needs_human, is_spam,
                   sentiment, confidence, validation_errors, model, raw)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
               on conflict (call_id) do nothing""",
            call_id, data["intent"], data.get("patient_name_bn"), data.get("patient_name_en"),
            data.get("phone_e164"), data.get("reason_for_visit"), data.get("preferred_date_text"),
            data.get("preferred_datetime"), outcome, data.get("needs_human", False),
            data.get("is_spam", False), data.get("sentiment"), data.get("confidence"),
            data.get("validation_errors", []), data.get("model"),
            json.dumps(data.get("raw"), ensure_ascii=False, default=str),
        )
        await c.execute(
            "update calls set outcome = $2, flags = $3, summary_bn = $4, summary_en = $5 where id = $1",
            call_id, outcome, flags, summary_bn, summary_en,
        )
        for seq, text_en in translations.items():
            await c.execute(
                "update transcript_turns set text_en = $3 where call_id = $1 and seq = $2", call_id, seq, text_en,
            )


async def mark_failed(call_id: str, reason: str) -> None:
    p = await pool()
    await p.execute(
        "update calls set status = 'failed', outcome = coalesce(outcome, 'failed'), end_reason = $2, ended_at = coalesce(ended_at, now()) where id = $1",
        call_id, reason,
    )
