import Link from "next/link";
import { OutcomeBadge } from "@/components/portal/Badge";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { fmtDate, fmtDateTime, fmtDuration, fmtPhone, fmtTime, OUTCOMES } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CallRow = { id: string; started_at: string; duration_s: number | null; status: string; outcome: string | null; caller_name_bn: string | null; caller_name_en: string | null; caller_phone: string | null; reason_for_visit: string | null };

export default async function Dashboard() {
  const supabase = await supabaseServer();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: calls }, { data: upcoming }, { count: openCallbacks }, { data: latency }] = await Promise.all([
    supabase.from("call_list").select("id, started_at, duration_s, status, outcome, caller_name_bn, caller_name_en, caller_phone, reason_for_visit").gte("started_at", since).order("started_at", { ascending: false }),
    supabase.from("appointments").select("id, starts_at, status, patients(full_name_bn, full_name_en), doctors(full_name_en), services(name_en)").eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(6),
    supabase.from("callbacks").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("calls").select("avg_latency_ms").gte("started_at", since).not("avg_latency_ms", "is", null),
  ]);
  const rows = (calls ?? []) as CallRow[];
  const byOutcome = rows.reduce<Record<string, number>>((m, c) => ((m[c.outcome ?? "incomplete"] = (m[c.outcome ?? "incomplete"] ?? 0) + 1), m), {});
  const booked = (byOutcome.booked ?? 0) + (byOutcome.rescheduled ?? 0);
  const durations = rows.map((r) => r.duration_s).filter((d): d is number => d != null);
  const lat = (latency ?? []).map((l) => l.avg_latency_ms as number);
  const max = Math.max(1, ...Object.values(byOutcome));

  const stats = [
    { label: "Calls (7 days)", value: rows.length },
    { label: "Booked / moved", value: booked, sub: rows.length ? `${Math.round((booked / rows.length) * 100)}% of calls` : "" },
    { label: "Open callbacks", value: openCallbacks ?? 0, href: "/portal/callbacks" },
    { label: "Avg call length", value: fmtDuration(durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null) },
    { label: "Avg response time", value: lat.length ? `${(lat.reduce((a, b) => a + b, 0) / lat.length / 1000).toFixed(1)}s` : "—", sub: "caller stops → agent speaks" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">What the AI receptionist handled in the last 7 days. Times in Dhaka.</p>
        </div>
        <LiveRefresh />
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => {
          const body = (
            <>
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
              {s.sub && <p className="text-xs text-slate-400">{s.sub}</p>}
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-amber-300">{body}</Link>
          ) : (
            <div key={s.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">{body}</div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">Call outcomes</h2>
          <ul className="mt-4 space-y-2.5">
            {Object.entries(byOutcome).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <li key={k} className="text-sm">
                <div className="flex justify-between"><span>{OUTCOMES[k]?.label ?? k}</span><span className="tabular-nums text-slate-500">{n}</span></div>
                <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-amber-400" style={{ width: `${(n / max) * 100}%` }} /></div>
              </li>
            ))}
            {!rows.length && <li className="text-sm text-slate-400">No calls yet.</li>}
          </ul>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Upcoming appointments</h2>
            <Link href="/portal/appointments" className="text-sm text-amber-700 hover:underline">All</Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {(upcoming ?? []).map((a) => {
              const p = a.patients as unknown as { full_name_bn: string | null; full_name_en: string | null };
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="w-32 font-medium">{fmtDate(a.starts_at)} · {fmtTime(a.starts_at)}</span>
                  <span className="flex-1"><span className="font-[family-name:var(--font-bangla)]">{p?.full_name_bn}</span> <span className="text-slate-500">{p?.full_name_en}</span></span>
                  <span className="text-slate-500">{(a.services as unknown as { name_en: string })?.name_en} · {(a.doctors as unknown as { full_name_en: string })?.full_name_en}</span>
                </li>
              );
            })}
            {!upcoming?.length && <li className="py-3 text-sm text-slate-400">Nothing booked yet.</li>}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-semibold">Latest calls</h2>
          <Link href="/portal/calls" className="text-sm text-amber-700 hover:underline">All calls</Link>
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link href={`/portal/calls/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                <span className="w-36 text-slate-500">{fmtDateTime(c.started_at)}</span>
                <span className="min-w-40 flex-1 font-medium">{c.caller_name_en ?? c.caller_name_bn ?? "Unknown caller"} <span className="font-normal text-slate-400">{fmtPhone(c.caller_phone)}</span></span>
                <span className="hidden text-slate-500 sm:inline">{c.reason_for_visit ?? ""}</span>
                <OutcomeBadge outcome={c.outcome} status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
