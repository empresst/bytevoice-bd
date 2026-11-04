import Link from "next/link";
import { fmtDateTime, fmtPhone } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await supabaseServer();
  let query = supabase
    .from("patients")
    .select("id, full_name_bn, full_name_en, phone_e164, created_at, calls(id, started_at, outcome), appointments(id, starts_at, status)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    const s = q.replace(/[%,()]/g, " ").trim();
    const digits = s.replace(/\D/g, "").replace(/^0/, "");
    query = query.or([`full_name_en.ilike.%${s}%`, `full_name_bn.ilike.%${s}%`, digits.length >= 3 ? `phone_e164.ilike.%${digits}%` : null].filter(Boolean).join(","));
  }
  const { data } = await query;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Patients</h1>
        <p className="text-sm text-slate-500">One record per person. Families often share a phone in Bangladesh, so a patient is matched on phone <i>and</i> name.</p>
      </header>
      <form><input name="q" defaultValue={q} placeholder="Search name or phone…" className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></form>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Calls</th><th className="px-4 py-3">Appointments</th><th className="px-4 py-3">First seen</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data ?? []).map((p) => {
              const calls = (p.calls as { id: string; started_at: string }[]) ?? [];
              const appts = (p.appointments as { status: string }[]) ?? [];
              const last = [...calls].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3"><span className="font-medium">{p.full_name_en}</span> <span className="font-[family-name:var(--font-bangla)] text-slate-500">{p.full_name_bn}</span></td>
                  <td className="px-4 py-3 tabular-nums">{fmtPhone(p.phone_e164)}</td>
                  <td className="px-4 py-3">{calls.length}{last && <Link href={`/portal/calls/${last.id}`} className="ml-2 text-xs text-amber-700 hover:underline">latest →</Link>}</td>
                  <td className="px-4 py-3">{appts.filter((a) => a.status === "scheduled").length} scheduled · {appts.filter((a) => a.status === "cancelled").length} cancelled</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDateTime(p.created_at)}</td>
                </tr>
              );
            })}
            {!data?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No patients.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
