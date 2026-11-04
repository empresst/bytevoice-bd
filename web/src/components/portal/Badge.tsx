import { OUTCOMES } from "@/lib/format";

export function OutcomeBadge({ outcome, status }: { outcome: string | null; status?: string | null }) {
  const key = status === "live" ? "live" : outcome ?? "incomplete";
  const o = OUTCOMES[key] ?? { label: key, cls: "bg-slate-100 text-slate-700 ring-slate-200" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${o.cls}`}>{status === "live" ? "Live now" : o.label}</span>;
}

export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "rose" | "amber" }) {
  const cls = { slate: "bg-slate-100 text-slate-700", rose: "bg-rose-100 text-rose-700", amber: "bg-amber-100 text-amber-800" }[tone];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
