import Link from "next/link";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { fmtDateTime, fmtPhone } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveCallback } from "../../actions";

export const dynamic = "force-dynamic";

const CATEGORY_TONE: Record<string, string> = { emergency: "bg-rose-600 text-white", medical_question: "bg-violet-100 text-violet-800", complaint: "bg-amber-100 text-amber-900", billing: "bg-sky-100 text-sky-800", other: "bg-slate-100 text-slate-700" };

export default async function CallbacksPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("callbacks").select("id, category, reason, status, phone_e164, created_at, resolved_at, call_id").order("status").order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Callbacks</h1>
          <p className="text-sm text-slate-500">Requests the AI is not allowed to handle (medical questions, complaints, emergencies). A staff member should call back.</p>
        </div>
        <LiveRefresh tables={["callbacks"]} />
      </header>
      <ul className="space-y-3">
        {(data ?? []).map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${c.status === "done" ? "opacity-60" : ""}`}>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_TONE[c.category] ?? ""}`}>{c.category.replaceAll("_", " ")}</span>
            <span className="min-w-48 flex-1 text-sm">{c.reason}<span className="block text-xs text-slate-500">{fmtDateTime(c.created_at)} · {fmtPhone(c.phone_e164)}</span></span>
            {c.call_id && <Link href={`/portal/calls/${c.call_id}`} className="text-xs text-amber-700 hover:underline">Call →</Link>}
            {c.status === "open" ? (
              <form action={resolveCallback}><input type="hidden" name="id" value={c.id} /><button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Mark done</button></form>
            ) : (
              <span className="text-xs text-emerald-700">Done {fmtDateTime(c.resolved_at)}</span>
            )}
          </li>
        ))}
        {!data?.length && <li className="rounded-xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-200">No callback requests.</li>}
      </ul>
    </div>
  );
}
