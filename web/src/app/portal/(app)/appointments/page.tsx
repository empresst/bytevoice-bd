import Link from "next/link";
import { Pill } from "@/components/portal/Badge";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { fmtDate, fmtDateTime, fmtPhone, fmtTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TONE = { scheduled: "bg-emerald-100 text-emerald-800", cancelled: "bg-slate-200 text-slate-600", completed: "bg-sky-100 text-sky-800", no_show: "bg-rose-100 text-rose-700" } as Record<string, string>;

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ show?: string; doctor?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: doctors } = await supabase.from("doctors").select("id, full_name_en").order("full_name_en");
  let q = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, notes, call_id, created_at, patients(full_name_bn, full_name_en, phone_e164), doctors(full_name_en), services(name_en, fee_bdt), appointment_events(event, old_starts_at, new_starts_at, created_at)")
    .order("starts_at", { ascending: sp.show !== "all" });
  if (sp.show !== "all") q = q.eq("status", "scheduled").gte("starts_at", new Date().toISOString());
  if (sp.doctor) q = q.eq("doctor_id", sp.doctor);
  const { data: appts } = await q.limit(200);

  // Group by Dhaka day.
  const groups = new Map<string, NonNullable<typeof appts>>();
  (appts ?? []).forEach((a) => {
    const k = fmtDate(a.starts_at);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-sm text-slate-500">Booked, moved and cancelled by the AI. Each slot links to the call that created it.</p>
        </div>
        <LiveRefresh tables={["appointments", "appointment_events"]} />
      </header>
      <form className="flex flex-wrap gap-3">
        <select name="show" defaultValue={sp.show ?? "upcoming"} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="upcoming">Upcoming (scheduled)</option>
          <option value="all">All, incl. cancelled & past</option>
        </select>
        <select name="doctor" defaultValue={sp.doctor ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All doctors</option>
          {(doctors ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name_en}</option>)}
        </select>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      {[...groups.entries()].map(([day, list]) => (
        <section key={day} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">{day}</h2>
          <ul className="divide-y divide-slate-100">
            {list.map((a) => {
              const p = a.patients as unknown as { full_name_bn: string | null; full_name_en: string | null; phone_e164: string };
              const s = a.services as unknown as { name_en: string; fee_bdt: number };
              const events = (a.appointment_events as unknown as { event: string; old_starts_at: string | null; new_starts_at: string | null; created_at: string }[]) ?? [];
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-3 text-sm">
                  <span className="w-28 font-semibold tabular-nums">{fmtTime(a.starts_at)}<span className="block text-xs font-normal text-slate-400">to {fmtTime(a.ends_at)}</span></span>
                  <span className="min-w-48 flex-1">
                    <span className="font-medium">{p?.full_name_en}</span> <span className="font-[family-name:var(--font-bangla)] text-slate-500">{p?.full_name_bn}</span>
                    <span className="block text-xs tabular-nums text-slate-500">{fmtPhone(p?.phone_e164)}</span>
                    {events.length > 1 && <span className="mt-1 block text-xs text-slate-400">History: {events.map((e) => `${e.event} ${fmtDateTime(e.created_at)}`).join(" → ")}</span>}
                  </span>
                  <span className="text-slate-600">{s?.name_en} · ৳{s?.fee_bdt}<span className="block text-xs text-slate-400">{(a.doctors as unknown as { full_name_en: string })?.full_name_en}</span></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status] ?? ""}`}>{a.status}</span>
                  {a.call_id && <Link href={`/portal/calls/${a.call_id}`} className="text-xs text-amber-700 hover:underline">Call →</Link>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!appts?.length && <p className="rounded-xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-200">No appointments.</p>}
      {sp.show !== "all" && <p className="text-xs text-slate-400"><Pill>Tip</Pill> Switch to “All” to see cancelled ones and the full history.</p>}
    </div>
  );
}
