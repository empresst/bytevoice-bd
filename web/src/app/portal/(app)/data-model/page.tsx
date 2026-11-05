import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Table = { name: string; group: "Clinic" | "Calls" | "Bookings" | "Access"; purpose: string; cols: string[]; fks?: string[] };

const TABLES: Table[] = [
  { name: "clinics", group: "Clinic", purpose: "The practice: names in Bangla and English, address, hours and FAQs the AI may quote.", cols: ["id", "name_bn / name_en", "address_bn", "timezone = Asia/Dhaka", "info (jsonb)"] },
  { name: "doctors", group: "Clinic", purpose: "Who works there and their specialty.", cols: ["id", "full_name_bn / _en", "specialty_bn", "active"], fks: ["clinics"] },
  { name: "services", group: "Clinic", purpose: "What can be booked, how long it takes and the fee in taka.", cols: ["code (unique per clinic)", "name_bn / _en", "duration_min", "fee_bdt", "prep_notes_bn"], fks: ["clinics"] },
  { name: "doctor_services", group: "Clinic", purpose: "Which doctor offers which service.", cols: ["doctor_id", "service_id"], fks: ["doctors", "services"] },
  { name: "doctor_schedules", group: "Clinic", purpose: "Weekly chamber hours. Friday has none: the clinic is closed.", cols: ["weekday 0-6", "start_time", "end_time", "slot_minutes"], fks: ["doctors"] },
  { name: "calls", group: "Calls", purpose: "One row per call, created the moment the agent joins.", cols: ["id", "started_at / ended_at", "duration_s (generated)", "status: live | ended | failed", "outcome", "flags[]", "end_reason", "summary_bn / _en", "avg_latency_ms", "quality (reply times, voice, LLM, recognition restarts)", "livekit_room"], fks: ["clinics", "patients"] },
  { name: "transcript_turns", group: "Calls", purpose: "Every line spoken, saved live during the call; English added after.", cols: ["call_id + seq (unique)", "speaker: agent | caller", "text_bn", "text_en", "offset_ms", "interrupted"], fks: ["calls"] },
  { name: "call_extractions", group: "Calls", purpose: "Structured fields pulled from the transcript after the call, validated first.", cols: ["call_id (PK)", "intent", "patient_name_bn / _en", "phone_e164 (checked)", "reason_for_visit", "preferred_date_text + _datetime", "outcome", "confidence", "validation_errors[]", "raw (jsonb)"], fks: ["calls"] },
  { name: "tool_invocations", group: "Calls", purpose: "Audit log of every action the AI took mid-call: input, output, success, timing.", cols: ["call_id", "tool_name", "args (jsonb)", "result (jsonb)", "ok", "duration_ms"], fks: ["calls"] },
  { name: "patients", group: "Bookings", purpose: "The person behind the calls. Matched on phone + name, because families share phones.", cols: ["id", "full_name_bn / _en", "phone_e164 (+8801XXXXXXXXX only)"], fks: ["clinics"] },
  { name: "appointments", group: "Bookings", purpose: "Booked slots. The database itself refuses overlapping bookings for a doctor.", cols: ["starts_at / ends_at (UTC)", "status: scheduled | cancelled | completed | no_show", "call_id (who booked it)"], fks: ["patients", "doctors", "services", "calls"] },
  { name: "appointment_events", group: "Bookings", purpose: "Full history: booked → rescheduled → cancelled, with old and new times.", cols: ["event", "old_starts_at", "new_starts_at", "actor: ai_agent | staff", "reason"], fks: ["appointments", "calls"] },
  { name: "callbacks", group: "Bookings", purpose: "Things the AI must not handle (medical advice, complaints, emergencies) for staff to call back.", cols: ["category", "reason", "status: open | done", "resolved_by"], fks: ["calls", "patients"] },
  { name: "staff", group: "Access", purpose: "Portal users and their role, linked to Supabase Auth.", cols: ["user_id → auth.users", "clinic_id", "role: admin | receptionist"], fks: ["clinics"] },
];

const GROUP_STYLE = { Clinic: "border-sky-300 bg-sky-50", Calls: "border-amber-300 bg-amber-50", Bookings: "border-emerald-300 bg-emerald-50", Access: "border-violet-300 bg-violet-50" };

const FLOW = [
  ["Browser", "Visitor clicks “Talk to our Bangla caller”. /api/call checks the rate limit and returns a 10-minute token for a fresh LiveKit room."],
  ["LiveKit Cloud", "WebRTC audio. The room is created with the agent dispatched into it (Mumbai region)."],
  ["Voice agent", "Deepgram (Bangla; English for phone numbers) → Gemma 4 → Azure / Cartesia voice. A calls row is inserted on join."],
  ["During the call", "Each spoken line → transcript_turns. Each tool → Postgres functions (book / reschedule / cancel) + tool_invocations."],
  ["After the call", "The transcript is sent to an LLM for structured JSON, validated with Pydantic + Postgres checks, then stored in call_extractions."],
  ["Portal", "Staff sign in (Supabase Auth). Row-level security limits them to their clinic. Realtime pushes new calls in seconds."],
];

const RULES = [
  ["No double booking", "EXCLUDE constraint on (doctor_id, time range) for scheduled appointments: two bookings for one doctor cannot overlap, even under concurrent calls."],
  ["Bangladeshi phone numbers", "normalize_bd_phone() accepts Bangla or English digits, +880/880/0 prefixes; stored only as +8801[3-9]XXXXXXXX (CHECK constraint)."],
  ["Spoken numbers", "Words like “জিরো ওয়ান”, “শূন্য এক”, “double one” are converted in code, not by the LLM, then read back digit by digit."],
  ["Bookings are all-or-nothing", "book / reschedule / cancel run inside Postgres functions in one transaction, and check the caller’s phone owns the appointment."],
  ["Model output is not trusted", "Extraction is validated; invalid fields are dropped and listed in validation_errors. An outcome of “booked” only counts if a booking really happened in the database."],
  ["Privacy", "Visitors’ IPs are stored only as salted hashes for rate limiting. Signed-out users can read nothing; only the agent can change bookings."],
];

export default async function DataModelPage() {
  const supabase = await supabaseServer();
  const counts = await Promise.all(
    TABLES.filter((t) => t.name !== "doctor_services").map(async (t) => {
      const { count } = await supabase.from(t.name).select("*", { count: "exact", head: true });
      return [t.name, count ?? 0] as const;
    }),
  );
  const count = Object.fromEntries(counts);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold">Data model</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          How every call is organised, structured and stored. Postgres 17 on Supabase, region <b>ap-south-1 (Mumbai)</b>, the closest available region to Bangladesh.
          Times are stored in UTC and shown in Asia/Dhaka. Live row counts are for this clinic.
        </p>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Key columns shown. Full schema (every column, type, constraint, index and security policy):{" "}
          <a href="https://github.com/empresst/bytevoice-bd/tree/main/supabase/migrations" target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 underline">
            supabase/migrations on GitHub
          </a>
          .
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tables and relationships</h2>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(GROUP_STYLE).map(([g, cls]) => <span key={g} className={`rounded-full border px-2.5 py-0.5 ${cls}`}>{g}</span>)}
          <span className="text-slate-400">→ = foreign key (references)</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TABLES.map((t) => (
            <article key={t.name} className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ring-1 ring-slate-200 ${GROUP_STYLE[t.group].split(" ")[0]}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-mono text-sm font-bold">{t.name}</h3>
                {t.name in count && <span className="text-xs tabular-nums text-slate-400">{count[t.name]} rows</span>}
              </div>
              <p className="mt-1 text-xs text-slate-600">{t.purpose}</p>
              <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-500">{t.cols.map((c) => <li key={c}>· {c}</li>)}</ul>
              {t.fks && <p className="mt-2 text-[11px] text-slate-500">→ {t.fks.join(", ")}</p>}
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">From a live call to the database</h2>
        <ol className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {FLOW.map(([title, body], i) => (
            <li key={title} className="relative rounded-xl bg-[#0b1226] p-4 text-slate-300">
              <span className="text-xs font-bold text-amber-400">{i + 1}</span>
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Validation and safety rules</h2>
        <dl className="grid gap-3 md:grid-cols-2">
          {RULES.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <dt className="font-semibold">{k}</dt>
              <dd className="mt-1 text-sm text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
