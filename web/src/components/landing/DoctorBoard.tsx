"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n";

// "Our doctors" board: live free/booked slots for the demo clinic, so visitors
// know what to ask the Bangla caller. Booking itself happens by voice.

type Doctor = {
  id: string; code: string; name_bn: string; name_en: string; specialty_bn: string; specialty_en: string;
  services: { code: string; name_bn: string; name_en: string; fee_bdt: number }[];
  hours: { weekday: number; start: string; end: string }[];
};
type Slot = { doctor_id: string; starts_at: string; booked: boolean };
type Data = { today: string; doctors: Doctor[]; slots: Slot[] };

const TZ = "Asia/Dhaka";
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bn = (n: number | string) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);
const DAY_BN = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const DAY_BN_SHORT = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];
const DAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

/** Wall-clock parts of an instant in Dhaka. */
function dhaka(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { date, h: +p.hour, m: +p.minute };
}
const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function partOfDay(h: number) {
  if (h < 12) return { bn: "সকাল", en: "AM" };
  if (h < 15) return { bn: "দুপুর", en: "PM" };
  if (h < 18) return { bn: "বিকেল", en: "PM" };
  if (h < 20) return { bn: "সন্ধ্যা", en: "PM" };
  return { bn: "রাত", en: "PM" };
}
function timeLabel(h: number, m: number, lang: "bn" | "en") {
  const h12 = h % 12 || 12;
  const mm = String(m).padStart(2, "0");
  return lang === "bn" ? `${partOfDay(h).bn} ${bn(h12)}:${bn(mm)}` : `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}
function dateLabel(date: string, lang: "bn" | "en", long = false) {
  const [, mo, d] = date.split("-").map(Number);
  const dow = dowOf(date);
  if (lang === "bn") return long ? `${DAY_BN[dow]}, ${bn(d)} ${MONTH_BN[mo - 1]}` : `${DAY_BN_SHORT[dow]} ${bn(d)}`;
  const mon = new Date(`${date}T12:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return long ? `${DAY_EN[dow]}, ${d} ${mon}` : `${DAY_EN[dow].slice(0, 3)} ${d}`;
}
const hoursLabel = (hours: Doctor["hours"], lang: "bn" | "en") => {
  const byTime = new Map<string, number[]>();
  hours.forEach((h) => byTime.set(`${h.start}-${h.end}`, [...(byTime.get(`${h.start}-${h.end}`) ?? []), h.weekday]));
  return [...byTime.entries()].map(([t, days]) => {
    const [s, e] = t.split("-").map((x) => x.split(":").map(Number));
    const order = [6, 0, 1, 2, 3, 4]; // Sat first, as clinics in Bangladesh list it
    const ds = order.filter((d) => days.includes(d)).map((d) => (lang === "bn" ? DAY_BN_SHORT[d] : DAY_EN[d].slice(0, 3))).join(", ");
    return `${ds}: ${timeLabel(s[0], s[1], lang)} – ${timeLabel(e[0], e[1], lang)}`;
  });
};

const T = {
  title: { bn: "আমাদের চিকিৎসকবৃন্দ", en: "Our doctors" },
  sub: { bn: "আপনার পছন্দের চিকিৎসক ও অ্যাপয়েন্টমেন্টের স্লট নির্বাচন করুন।", en: "Choose your doctor and an appointment slot." },
  services: { bn: "সেবা উপলব্ধ", en: "Services" },
  chamber: { bn: "চেম্বারের সময়", en: "Chamber hours" },
  date: { bn: "তারিখ", en: "Date" },
  next: { bn: "পরবর্তী উপলব্ধ স্লট", en: "Next available slot" },
  today: { bn: "আজকের স্লট", en: "Today's slots" },
  available: { bn: "উপলব্ধ স্লট", en: "Available slots" },
  none: { bn: "কোনো স্লট পাওয়া যাচ্ছে না", en: "No slots available" },
  closed: { bn: "শুক্রবার ক্লিনিক বন্ধ", en: "The clinic is closed on Friday" },
  noChamber: { bn: "এই দিনে চেম্বার নেই", en: "No chamber on this day" },
  booked: { bn: "বুক হয়েছে", en: "Booked" },
  pick: { bn: "একটি স্লট নির্বাচন করুন", en: "Pick a slot" },
  callFor: { bn: "এই সময়ের জন্য কল করুন", en: "Call for this time" },
  say: { bn: "কলে বলুন:", en: "In the call, say (in Bangla):" },
  start: { bn: "কল শুরু করুন", en: "Start the call" },
  copy: { bn: "কপি", en: "Copy" },
  copied: { bn: "কপি হয়েছে", en: "Copied" },
  live: { bn: "লাইভ: কলে বুক করলে এখানে সাথে সাথে দেখা যাবে", en: "Live: bookings made in a call appear here right away" },
  tryTitle: { bn: "আরও যা পরীক্ষা করতে পারেন", en: "More things to try" },
  todayChip: { bn: "আজ", en: "Today" },
  tomorrowChip: { bn: "কাল", en: "Tomorrow" },
  fee: { bn: "৳", en: "৳" },
};
const TRY = [
  { bn: "আমার appointment টা বাতিল করতে চাই", en: "Cancel: “আমার appointment টা বাতিল করতে চাই”" },
  { bn: "আমার appointment এর সময়টা বদলাতে চাই", en: "Reschedule: “আমার appointment এর সময়টা বদলাতে চাই”" },
  { bn: "দাঁত ব্যথার জন্য কোন ওষুধ খাবো?", en: "Medical advice (it should decline): “দাঁত ব্যথার জন্য কোন ওষুধ খাবো?”" },
  { bn: "আজকে খেলা কে জিতবে?", en: "Off-topic (it should redirect): “আজকে খেলা কে জিতবে?”" },
];

export function DoctorBoard() {
  const { lang } = useLang();
  const t = (k: keyof typeof T) => T[k][lang];
  const [data, setData] = useState<Data | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/availability", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    // Fetch on mount, then poll; setState happens after the network round trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(load, 30_000);
    const onEnded = () => setTimeout(load, 2000); // in case a change landed as the call closed
    window.addEventListener("bv-call-ended", onEnded);
    window.addEventListener("bv-slots-changed", load); // the agent just booked, moved or cancelled
    return () => {
      clearInterval(id);
      window.removeEventListener("bv-call-ended", onEnded);
      window.removeEventListener("bv-slots-changed", load);
    };
  }, [load]);

  const doctor = useMemo(() => data?.doctors.find((d) => d.id === docId) ?? data?.doctors[0], [data, docId]);
  const docSlots = useMemo(() => (data && doctor ? data.slots.filter((s) => s.doctor_id === doctor.id) : []), [data, doctor]);
  const days = useMemo(() => (data ? Array.from({ length: 8 }, (_, i) => addDays(data.today, i)) : []), [data]);
  const activeDate = date ?? days.find((d) => docSlots.some((s) => !s.booked && dhaka(s.starts_at).date === d)) ?? days[0];
  const daySlots = docSlots.filter((s) => dhaka(s.starts_at).date === activeDate);
  const nextFree = docSlots.find((s) => !s.booked);
  const isFriday = activeDate && dowOf(activeDate) === 5;
  const hasChamber = doctor?.hours.some((h) => h.weekday === dowOf(activeDate ?? ""));

  const sentence = (s: Slot) => {
    const d = dhaka(s.starts_at);
    const first = doctor!.name_bn.replace("ডা. ", "");
    const svc = doctor!.services[0];
    const svcName = !svc || svc.code === "checkup" ? "চেক-আপ" : svc.name_bn;
    return `${DAY_BN[dowOf(d.date)]} ${timeLabel(d.h, d.m, "bn")}-এ ডাক্তার ${first}ের কাছে ${svcName} করাতে চাই`;
  };
  const startCall = () => {
    window.dispatchEvent(new Event("bv-start-call"));
    document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="doctors" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h2>
        <p className="mt-3 text-slate-400">{t("sub")}</p>
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />{t("live")}</p>
      </div>

      {!data ? (
        <div className="h-72 animate-pulse rounded-3xl bg-white/[0.04]" />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-[#0b1226]">
          {/* doctor tabs */}
          <div role="tablist" className="flex overflow-x-auto border-b border-white/10">
            {data.doctors.map((d) => {
              const active = d.id === doctor?.id;
              return (
                <button key={d.id} role="tab" aria-selected={active} onClick={() => { setDocId(d.id); setDate(null); setPicked(null); }}
                  className={`min-w-max flex-1 px-5 py-4 text-left transition ${active ? "bg-white/[0.06] text-white shadow-[inset_0_-3px_0_#fbbf24]" : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"}`}>
                  <span className="block font-semibold">{lang === "bn" ? d.name_bn : d.name_en}</span>
                  <span className="block text-xs text-slate-500">{lang === "bn" ? d.specialty_bn : d.specialty_en}</span>
                </button>
              );
            })}
          </div>

          {doctor && (
            <div className="grid min-w-0 gap-8 p-5 sm:p-6 lg:grid-cols-[1fr_1.6fr] lg:p-8">
              {/* doctor details */}
              <div className="min-w-0">
                <h3 className="text-2xl font-bold">{lang === "bn" ? doctor.name_bn : doctor.name_en}</h3>
                <p className="text-amber-300">{lang === "bn" ? doctor.specialty_bn : doctor.specialty_en}</p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("services")}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {doctor.services.map((s) => (
                    <li key={s.code} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm">
                      {lang === "bn" ? s.name_bn : s.name_en} <span className="text-slate-500">· ৳{lang === "bn" ? bn(s.fee_bdt) : s.fee_bdt}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("chamber")}</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">{hoursLabel(doctor.hours, lang).map((h) => <li key={h}>{h}</li>)}</ul>
                {nextFree && (
                  <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                    <p className="text-xs font-semibold text-emerald-300">{t("next")}</p>
                    <p className="mt-1 font-semibold">{dateLabel(dhaka(nextFree.starts_at).date, lang, true)}, {timeLabel(dhaka(nextFree.starts_at).h, dhaka(nextFree.starts_at).m, lang)}</p>
                  </div>
                )}
              </div>

              {/* dates and slots */}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("date")}: <span className="normal-case text-slate-300">{activeDate && dateLabel(activeDate, lang, true)}</span></p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {days.map((d, i) => {
                    const fri = dowOf(d) === 5;
                    const free = docSlots.filter((s) => !s.booked && dhaka(s.starts_at).date === d).length;
                    const active = d === activeDate;
                    return (
                      <button key={d} onClick={() => { setDate(d); setPicked(null); }} disabled={fri}
                        className={`min-w-[4.5rem] rounded-xl border px-3 py-2 text-center text-sm transition ${active ? "border-amber-400 bg-amber-400 text-slate-900" : fri ? "cursor-not-allowed border-white/5 text-slate-600" : "border-white/10 hover:border-amber-400/50"}`}>
                        <span className="block font-semibold">{i === 0 ? t("todayChip") : i === 1 ? t("tomorrowChip") : dateLabel(d, lang).split(" ")[0]}</span>
                        <span className={`block text-xs ${active ? "text-slate-800" : "text-slate-500"}`}>{fri ? (lang === "bn" ? "বন্ধ" : "Closed") : lang === "bn" ? `${bn(free)}টি` : `${free} free`}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">{activeDate === data.today ? t("today") : t("available")}</p>
                <div className="mt-2 flex min-h-[4rem] flex-wrap gap-2">
                  {isFriday ? <p className="text-slate-400">{t("closed")}</p>
                    : !hasChamber ? <p className="text-slate-400">{t("noChamber")}</p>
                    : daySlots.length === 0 ? <p className="text-slate-400">{t("none")}</p>
                    : daySlots.map((s) => {
                      const d = dhaka(s.starts_at);
                      const sel = picked?.starts_at === s.starts_at;
                      return (
                        <button key={s.starts_at} disabled={s.booked} onClick={() => { setPicked(s); setCopied(false); }}
                          title={s.booked ? t("booked") : undefined}
                          className={`rounded-xl border px-3.5 py-2 text-sm tabular-nums transition ${s.booked ? "cursor-not-allowed border-white/5 text-slate-600 line-through" : sel ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100 hover:border-emerald-300"}`}>
                          {timeLabel(d.h, d.m, lang)}{s.booked && <span className="ml-1 text-[10px] no-underline">({t("booked")})</span>}
                        </button>
                      );
                    })}
                </div>

                <AnimatePresence mode="wait">
                  {picked ? (
                    <motion.div key={picked.starts_at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] p-5">
                      <p className="font-semibold text-amber-300">{t("callFor")}</p>
                      <p className="mt-2 text-sm text-slate-400">{t("say")}</p>
                      <p className="mt-1 text-lg font-medium">“{sentence(picked)}”</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button onClick={startCall} className="rounded-full bg-amber-400 px-5 py-2.5 font-semibold text-slate-900 hover:bg-amber-300">📞 {t("start")}</button>
                        <button onClick={() => { void navigator.clipboard?.writeText(sentence(picked)); setCopied(true); }} className="rounded-full border border-white/15 px-4 py-2.5 text-sm hover:border-white/40">
                          {copied ? t("copied") : t("copy")}
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 text-sm text-slate-500">{t("pick")}</motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <p className="text-sm font-semibold text-slate-300">{t("tryTitle")}</p>
        <ul className="mt-2 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
          {TRY.map((x) => <li key={x.bn}>• {lang === "bn" ? `“${x.bn}”` : x.en}</li>)}
        </ul>
      </div>
    </section>
  );
}
