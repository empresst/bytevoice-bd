import Link from "next/link";
import { OutcomeBadge, Pill } from "@/components/portal/Badge";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { fmtDateTime, fmtDuration, fmtPhone, OUTCOMES } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Search = { q?: string; outcome?: string; from?: string; to?: string; flag?: string };

export default async function CallsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  let query = supabase
    .from("call_list")
    .select("id, started_at, duration_s, status, outcome, flags, caller_name_bn, caller_name_en, caller_phone, intent, reason_for_visit, needs_human")
    .order("started_at", { ascending: false })
    .limit(200);
  if (sp.outcome) query = query.eq("outcome", sp.outcome);
  if (sp.flag) query = query.contains("flags", [sp.flag]);
  if (sp.from) query = query.gte("started_at", new Date(`${sp.from}T00:00:00+06:00`).toISOString());
  if (sp.to) query = query.lte("started_at", new Date(`${sp.to}T23:59:59+06:00`).toISOString());
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    query = query.or(
      [`caller_name_en.ilike.%${q}%`, `caller_name_bn.ilike.%${q}%`, `reason_for_visit.ilike.%${q}%`, digits.length >= 3 ? `caller_phone.ilike.%${digits}%` : null]
        .filter(Boolean)
        .join(","),
    );
  }
  const { data: calls, error } = await query;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Calls</h1>
          <p className="text-sm text-slate-500">Every call the AI answered, newest first. Click a call for its transcript and extracted details.</p>
        </div>
        <LiveRefresh />
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="flex-1 text-xs font-medium text-slate-500">Search
          <input name="q" defaultValue={sp.q} placeholder="Name (Bangla or English), phone, reason…" className="mt-1 w-full min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-xs font-medium text-slate-500">Outcome
          <select name="outcome" defaultValue={sp.outcome ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
            <option value="">All</option>
            {Object.entries(OUTCOMES).filter(([k]) => k !== "live").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">Flag
          <select name="flag" defaultValue={sp.flag ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
            <option value="">Any</option>
            {["off_topic", "medical_advice_request", "spam", "abusive", "emergency"].map((f) => <option key={f} value={f}>{f.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-medium text-slate-500">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Filter</button>
        {Object.values(sp).some(Boolean) && <Link href="/portal/calls" className="py-2 text-sm text-slate-500 hover:underline">Clear</Link>}
      </form>

      {error && <p className="text-sm text-rose-600">Could not load calls: {error.message}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Date & time</th><th className="px-4 py-3">Caller</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(calls ?? []).map((c) => (
              <tr key={c.id} className="group hover:bg-amber-50/40">
                <td className="whitespace-nowrap px-4 py-3"><Link href={`/portal/calls/${c.id}`} className="font-medium group-hover:text-amber-800">{fmtDateTime(c.started_at)}</Link></td>
                <td className="px-4 py-3">
                  <Link href={`/portal/calls/${c.id}`} className="block">
                    <span className="font-medium">{c.caller_name_en ?? "—"}</span>
                    {c.caller_name_bn && <span className="ml-2 font-[family-name:var(--font-bangla)] text-slate-500">{c.caller_name_bn}</span>}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{fmtPhone(c.caller_phone)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {c.reason_for_visit ?? "—"}
                  <span className="ml-2 inline-flex gap-1">{(c.flags as string[]).map((f) => <Pill key={f} tone="rose">{f.replaceAll("_", " ")}</Pill>)}</span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{fmtDuration(c.duration_s)}</td>
                <td className="px-4 py-3"><OutcomeBadge outcome={c.outcome} status={c.status} /></td>
              </tr>
            ))}
            {!calls?.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No calls match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{calls?.length ?? 0} calls shown{(calls?.length ?? 0) >= 200 ? " (latest 200)" : ""}.</p>
    </div>
  );
}
