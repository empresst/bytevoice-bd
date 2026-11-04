"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { COPY } from "./copy";
import { LangToggle, useLang, useT } from "./i18n";

const reveal = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.5 } };

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <motion.div {...reveal} className="mx-auto mb-12 max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{children}</h2>
      {sub && <p className="mt-3 text-slate-400">{sub}</p>}
    </motion.div>
  );
}

export function Nav() {
  const t = useT();
  const n = COPY.nav;
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#070b1a]/70 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-[family-name:var(--font-inter)] text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-sm">B</span>
          ByteVoice <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">BD</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <a href="#how" className="hover:text-white">{t(n.how)}</a>
          <a href="#features" className="hover:text-white">{t(n.features)}</a>
          <a href="#use-cases" className="hover:text-white">{t(n.useCases)}</a>
          <a href="#pricing" className="hover:text-white">{t(n.pricing)}</a>
          <Link href="/portal" className="hover:text-white">{t(n.portal)}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <LangToggle />
          <a href="#demo" className="hidden rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 sm:block">{t(n.demo)}</a>
        </div>
      </div>
    </header>
  );
}

export function Problem() {
  const t = useT();
  const { lang } = useLang();
  const p = COPY.problem;
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionTitle>{t(p.title)}</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        {p.items.map((it, i) => (
          <motion.div key={i} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-3xl font-bold text-amber-400">{lang === "bn" ? it.stat : it.statEn}</p>
            <p className="mt-2 text-slate-300">{t(it)}</p>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-right text-xs text-slate-500">{t(p.note)}</p>
    </section>
  );
}

export function HowItWorks() {
  const t = useT();
  const h = COPY.how;
  return (
    <section id="how" className="border-y border-white/5 bg-white/[0.02] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle>{t(h.title)}</SectionTitle>
        <ol className="grid gap-6 md:grid-cols-3">
          {h.steps.map((s, i) => (
            <motion.li key={i} {...reveal} transition={{ ...reveal.transition, delay: i * 0.12 }} className="relative rounded-2xl border border-white/10 bg-[#0b1226] p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-400 font-bold text-slate-900">{i + 1}</span>
              <h3 className="mt-4 text-xl font-semibold">{t(s)}</h3>
              <p className="mt-2 text-slate-400">{t(s.d)}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Features() {
  const t = useT();
  const f = COPY.features;
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionTitle>{t(f.title)}</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {f.items.map((it, i) => (
          <motion.div key={i} {...reveal} transition={{ ...reveal.transition, delay: (i % 3) * 0.08 }}
            className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6 transition hover:-translate-y-1 hover:border-amber-400/40">
            <span className="text-3xl" aria-hidden>{it.icon}</span>
            <h3 className="mt-3 text-lg font-semibold group-hover:text-amber-300">{t(it)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(it.d)}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function UseCases() {
  const t = useT();
  const u = COPY.useCases;
  return (
    <section id="use-cases" className="border-y border-white/5 bg-white/[0.02] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle>{t(u.title)}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {u.items.map((it, i) => (
            <motion.div key={i} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="rounded-2xl border border-white/10 bg-[#0b1226] p-6">
              <div className="mb-4 h-1 w-10 rounded-full bg-gradient-to-r from-amber-400 to-indigo-400" />
              <h3 className="text-lg font-semibold">{t(it)}</h3>
              <p className="mt-2 text-sm text-slate-400">{t(it.d)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  const t = useT();
  const { lang } = useLang();
  const p = COPY.pricing;
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionTitle sub={t(p.note)}>{t(p.title)}</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        {p.plans.map((pl, i) => {
          const price = typeof pl.price === "string" ? (lang === "bn" ? pl.price : pl.priceEn) : t(pl.price);
          return (
            <motion.div key={i} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}
              className={`rounded-2xl border p-7 ${pl.featured ? "border-amber-400/60 bg-amber-400/[0.06] shadow-[0_0_60px_-20px_rgba(251,191,36,0.5)]" : "border-white/10 bg-white/[0.03]"}`}>
              <p className="text-sm text-slate-400">{t(pl.d)}</p>
              <h3 className="mt-1 text-xl font-semibold">{t(pl.name)}</h3>
              <p className="mt-4 text-4xl font-bold">{price}{typeof pl.price === "string" && <span className="text-base font-normal text-slate-400">{t(p.month)}</span>}</p>
              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                {pl.f.map((x, j) => <li key={j} className="flex gap-2"><span className="text-emerald-400">✓</span>{t(x)}</li>)}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

export function DemoCta() {
  const t = useT();
  const c = COPY.cta;
  const [sent, setSent] = useState(false);
  return (
    <section id="demo" className="px-4 pb-20 sm:px-6">
      <motion.div {...reveal} className="mx-auto grid max-w-5xl gap-8 rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/30 via-[#0b1226] to-amber-500/20 p-8 sm:p-12 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">{t(c.title)}</h2>
          <p className="mt-3 text-slate-300">{t(c.sub)}</p>
        </div>
        {sent ? (
          <p className="self-center rounded-xl bg-emerald-500/15 p-4 text-emerald-200">{t(c.sent)}</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-3">
            {[c.name, c.clinic, c.phone].map((f, i) => (
              <input key={i} required type={i === 2 ? "tel" : "text"} placeholder={t(f)} aria-label={t(f)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none" />
            ))}
            <button className="w-full rounded-xl bg-amber-400 py-3 font-semibold text-slate-900 hover:bg-amber-300">{t(c.send)}</button>
          </form>
        )}
      </motion.div>
    </section>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-white/5 px-4 py-8 text-center text-xs text-slate-500">
      {t(COPY.footer)} · <Link href="/portal" className="hover:text-slate-300">{t(COPY.nav.portal)}</Link>
    </footer>
  );
}
