// Everything in the portal is shown in clinic time (Asia/Dhaka); the database stores UTC.
const TZ = "Asia/Dhaka";

export const fmtDateTime = (d: string | Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(d)) : "—";
export const fmtDate = (d: string | Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(d)) : "—";
export const fmtTime = (d: string | Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(d)) : "—";
export const fmtDuration = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
export const fmtOffset = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export const fmtPhone = (e164: string | null) => (e164 ? e164.replace(/^\+880(\d{4})(\d{3})(\d{3})$/, "0$1-$2-$3") : "—");

export const OUTCOMES: Record<string, { label: string; cls: string }> = {
  booked: { label: "Booked", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  rescheduled: { label: "Rescheduled", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  cancelled: { label: "Cancelled", cls: "bg-slate-200 text-slate-700 ring-slate-300" },
  enquiry: { label: "Enquiry", cls: "bg-violet-100 text-violet-800 ring-violet-200" },
  follow_up_needed: { label: "Follow-up needed", cls: "bg-amber-100 text-amber-900 ring-amber-200" },
  incomplete: { label: "Incomplete", cls: "bg-orange-100 text-orange-800 ring-orange-200" },
  failed: { label: "Failed", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  spam: { label: "Spam / prank", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  live: { label: "Live now", cls: "bg-red-500 text-white ring-red-400 animate-pulse" },
};
