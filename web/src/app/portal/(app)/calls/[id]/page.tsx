import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeBadge, Pill } from "@/components/portal/Badge";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { fmtDateTime, fmtDuration, fmtOffset, fmtPhone } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Turn = { seq: number; speaker: "agent" | "caller" | "system"; text_bn: string; text_en: string | null; offset_ms: number; interrupted: boolean; response_ms: number | null };
type Quality = { turns?: number; avg_response_ms?: number | null; max_response_ms?: number | null; avg_end_of_turn_ms?: number | null; avg_llm_first_token_ms?: number | null; avg_tts_first_audio_ms?: number | null; interruptions?: number; stt_restarts?: number; llm_models?: string[]; tts_providers?: string[] };
const sec = (ms?: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
type Tool = { id: number; tool_name: string; args: Record<string, unknown>; result: Record<string, unknown>; ok: boolean; duration_ms: number | null; created_at: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm sm:col-span-2 sm:mt-0">{children ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

const isStale = (startedAt: string) => Date.parse(startedAt) < Date.now() - 15 * 60_000;

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: call }, { data: x }, { data: turns }, { data: tools }, { data: appts }, { data: callbacks }] = await Promise.all([
    supabase.from("calls").select("*, patients(id, full_name_bn, full_name_en, phone_e164)").eq("id", id).maybeSingle(),
    supabase.from("call_extractions").select("*").eq("call_id", id).maybeSingle(),
    supabase.from("transcript_turns").select("seq, speaker, text_bn, text_en, offset_ms, interrupted, response_ms").eq("call_id", id).order("seq"),
    supabase.from("tool_invocations").select("*").eq("call_id", id).order("id"),
    supabase.from("appointment_events").select("event, old_starts_at, new_starts_at, created_at, appointments(id, starts_at, status, doctors(full_name_en), services(name_en))").eq("call_id", id).order("id"),
    supabase.from("callbacks").select("id, category, reason, status").eq("call_id", id),
  ]);
  if (!call) notFound();
  // An agent that died never marks its call ended; treat long-"live" calls as failed.
  if (call.status === "live" && isStale(call.started_at)) {
    call.status = "failed";
    call.outcome = call.outcome ?? "failed";
  }
  const patient = call.patients as { id: string; full_name_bn: string | null; full_name_en: string | null; phone_e164: string } | null;

  return (
    <div className="space-y-6">
      <Link href="/portal/calls" className="text-sm text-slate-500 hover:underline">← All calls</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {x?.patient_name_en ?? patient?.full_name_en ?? "Unknown caller"}
            {(x?.patient_name_bn ?? patient?.full_name_bn) && <span className="ml-3 font-[family-name:var(--font-bangla)] text-xl font-medium text-slate-500">{x?.patient_name_bn ?? patient?.full_name_bn}</span>}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {fmtDateTime(call.started_at)} · {fmtDuration(call.duration_s)} · {call.channel} call · ended by {call.end_reason?.replaceAll("_", " ") ?? "—"}
            {call.avg_latency_ms ? ` · avg response ${(call.avg_latency_ms / 1000).toFixed(1)}s` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {call.status === "live" && <LiveRefresh />}
          <OutcomeBadge outcome={call.outcome} status={call.status} />
        </div>
      </header>

      {(call.summary_en || call.summary_bn) && (
        <section className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Summary</p>
          {call.summary_en && <p className="mt-1 text-sm">{call.summary_en}</p>}
          {call.summary_bn && <p className="mt-1 font-[family-name:var(--font-bangla)] text-sm text-slate-700">{call.summary_bn}</p>}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">Extracted details</h2>
            <p className="text-xs text-slate-400">Pulled from the transcript after the call and validated before saving.</p>
            <dl className="mt-3 divide-y divide-slate-100">
              <Field label="Intent">{x?.intent}</Field>
              <Field label="Patient">{x?.patient_name_en || x?.patient_name_bn ? <>{x?.patient_name_en} <span className="font-[family-name:var(--font-bangla)] text-slate-500">{x?.patient_name_bn}</span></> : null}</Field>
              <Field label="Phone">{x?.phone_e164 ? <span className="tabular-nums">{fmtPhone(x.phone_e164)}</span> : null}</Field>
              <Field label="Reason for visit">{x?.reason_for_visit}</Field>
              <Field label="Preferred time">{x?.preferred_datetime || x?.preferred_date_text ? <>{x?.preferred_datetime ? fmtDateTime(x.preferred_datetime) : ""} {x?.preferred_date_text && <span className="block text-xs font-[family-name:var(--font-bangla)] text-slate-500">“{x.preferred_date_text}”</span>}</> : null}</Field>
              <Field label="Needs human">{x ? (x.needs_human ? <Pill tone="amber">Yes</Pill> : "No") : null}</Field>
              <Field label="Flags">{(call.flags as string[])?.length ? <span className="flex flex-wrap gap-1">{(call.flags as string[]).map((f) => <Pill key={f} tone="rose">{f.replaceAll("_", " ")}</Pill>)}</span> : "None"}</Field>
              <Field label="Sentiment">{x?.sentiment}</Field>
              <Field label="Confidence">{x?.confidence != null ? `${Math.round(Number(x.confidence) * 100)}%` : null}</Field>
              {x?.validation_errors?.length ? <Field label="Validation"><ul className="list-disc pl-4 text-xs text-rose-700">{(x.validation_errors as string[]).map((e) => <li key={e}>{e}</li>)}</ul></Field> : null}
            </dl>
            {!x && call.status !== "live" && <p className="mt-2 text-sm text-slate-400">Extraction not available yet.</p>}
            {!x && call.status === "live" && <p className="mt-2 text-sm text-slate-400">Details appear a few seconds after the call ends.</p>}
          </section>


          {(() => {
            const q = (call.quality ?? null) as Quality | null;
            if (!q || !q.turns) return null;
            const rows: [string, React.ReactNode][] = [
              ["Avg response time", <b key="a" className={q.avg_response_ms && q.avg_response_ms > 2000 ? "text-amber-700" : "text-emerald-700"}>{sec(q.avg_response_ms)}</b>],
              ["Breakdown (avg)", <span key="b" className="text-xs">end-of-speech wait {sec(q.avg_end_of_turn_ms)} · first LLM word {sec(q.avg_llm_first_token_ms)} · first voice sound {sec(q.avg_tts_first_audio_ms)}</span>],
              ["Slowest turn", sec(q.max_response_ms)],
              ["Turns measured", q.turns],
              ["Interruptions handled", q.interruptions ?? 0],
              ["LLM used", (q.llm_models ?? []).join(", ") || "—"],
              ["Voice used", (q.tts_providers ?? []).join(", ") || "—"],
              ...(q.stt_restarts ? [["Speech recognition", <span key="s" className="text-amber-700">Azure stalled {q.stt_restarts}× — fresh session started, caller asked to repeat</span>] as [string, React.ReactNode]] : []),
            ];
            return (
              <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="font-semibold">Call quality</h2>
                <p className="text-xs text-slate-400">Measured by LiveKit during the call: caller stops speaking → agent starts speaking.</p>
                <dl className="mt-3 divide-y divide-slate-100">{rows.map(([k, v]) => <Field key={k} label={k}>{v}</Field>)}</dl>
              </section>
            );
          })()}
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">Appointments changed in this call</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(appts ?? []).map((e, i) => {
                const a = e.appointments as unknown as { id: string; starts_at: string; status: string; doctors: { full_name_en: string }; services: { name_en: string } };
                return (
                  <li key={i} className="rounded-lg bg-slate-50 p-3">
                    <span className="font-medium capitalize">{e.event}</span>: {a?.services?.name_en} with {a?.doctors?.full_name_en}
                    <span className="block text-slate-600">
                      {e.event === "rescheduled" ? <>{fmtDateTime(e.old_starts_at)} → <b>{fmtDateTime(e.new_starts_at)}</b></> : e.event === "cancelled" ? <s>{fmtDateTime(e.old_starts_at)}</s> : <b>{fmtDateTime(e.new_starts_at)}</b>}
                    </span>
                  </li>
                );
              })}
              {!appts?.length && <li className="text-slate-400">No booking changes.</li>}
            </ul>
            {!!callbacks?.length && (
              <>
                <h3 className="mt-4 text-sm font-semibold">Callback requests</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {callbacks.map((c) => <li key={c.id}><Pill tone={c.status === "open" ? "amber" : "slate"}>{c.status}</Pill> <span className="ml-1">{c.category.replaceAll("_", " ")}: {c.reason}</span></li>)}
                </ul>
              </>
            )}
            {patient && <Link href={`/portal/patients?q=${encodeURIComponent(patient.phone_e164)}`} className="mt-4 inline-block text-sm text-amber-700 hover:underline">Patient history →</Link>}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">What the AI did</h2>
            <p className="text-xs text-slate-400">Every action the agent took during the call, with its inputs and result.</p>
            <ol className="mt-3 space-y-2">
              {((tools ?? []) as Tool[]).map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{t.tool_name}</span>
                    <span className={t.ok ? "text-emerald-700" : "text-rose-700"}>{t.ok ? "ok" : (t.result?.error as string) ?? "failed"} · {t.duration_ms}ms</span>
                  </div>
                  <details className="mt-1 text-slate-600">
                    <summary className="cursor-pointer text-slate-500">input / output</summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-[11px]">{JSON.stringify(t.args, null, 1)}</pre>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-[11px]">{JSON.stringify(t.result, null, 1)}</pre>
                  </details>
                </li>
              ))}
              {!tools?.length && <li className="text-sm text-slate-400">No actions.</li>}
            </ol>
          </section>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 xl:col-span-3">
          <h2 className="font-semibold">Transcript</h2>
          <p className="text-xs text-slate-400">Bangla as spoken, with an English translation for staff. Time is from the start of the call.</p>
          <ol className="mt-4 space-y-3">
            {((turns ?? []) as Turn[]).map((t) => (
              <li key={t.seq} className={`flex gap-3 ${t.speaker === "caller" ? "flex-row-reverse text-right" : ""}`}>
                <span className={`mt-1 h-8 w-8 shrink-0 rounded-full text-center text-xs font-bold leading-8 ${t.speaker === "agent" ? "bg-slate-900 text-amber-300" : "bg-amber-100 text-amber-900"}`}>{t.speaker === "agent" ? "AI" : "C"}</span>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${t.speaker === "agent" ? "bg-slate-100" : "bg-amber-50"}`}>
                  <p className="text-[11px] text-slate-500">{t.speaker === "agent" ? "Receptionist (AI)" : "Caller"} · {fmtOffset(t.offset_ms)}{t.speaker === "agent" && t.response_ms != null && <span className={t.response_ms > 2500 ? " text-amber-700" : " text-emerald-700"}> · replied in {sec(t.response_ms)}</span>}{t.interrupted && " · interrupted by caller"}</p>
                  <p className="font-[family-name:var(--font-bangla)] text-[15px] leading-relaxed">{t.text_bn}</p>
                  {t.text_en && <p className="mt-1 text-sm italic text-slate-500">{t.text_en}</p>}
                </div>
              </li>
            ))}
            {!turns?.length && <li className="text-sm text-slate-400">No speech recorded.</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}
