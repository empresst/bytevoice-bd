"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef } from "react";
import { CallWidget, type CallPhase } from "@/components/call/CallWidget";
import type { VoiceState } from "@/components/three/ByteMascot";
import { COPY } from "./copy";
import { DhakaSkyline } from "./DhakaSkyline";
import { useLang, useT } from "./i18n";

// Three.js only runs in the browser; show a soft glow until it loads.
const AvatarBoy = dynamic(() => import("@/components/three/AvatarBoy"), {
  ssr: false,
  loading: () => <div className="mx-auto mt-16 h-64 w-64 animate-pulse rounded-full bg-indigo-500/20 blur-2xl" />,
});

export function Hero() {
  const t = useT();
  const { lang } = useLang();
  const voice = useRef<VoiceState>({ level: 0, phase: "idle", speaking: false });
  const onLevel = useCallback((l: number) => { voice.current.level = l; }, []);
  const onPhase = useCallback((p: CallPhase) => { voice.current.phase = p; if (p !== "live") { voice.current.level = 0; voice.current.speaking = false; } }, []);
  const onAgentState = useCallback((s: string) => { voice.current.speaking = s === "speaking"; }, []);
  const h = COPY.hero;

  return (
    <section className="relative isolate overflow-hidden pt-24 sm:pt-28">
      {/* dusk sky */}
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_85%,#f59e0b33,transparent_55%),radial-gradient(ellipse_at_20%_10%,#4338ca55,transparent_50%),linear-gradient(180deg,#070b1a_0%,#141a46_55%,#3b2a5c_85%,#6b3f4a_100%)]" />
      <DhakaSkyline className="absolute inset-x-0 bottom-0 -z-10 h-40 w-full sm:h-56" />

      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 pb-28 sm:px-6 lg:grid-cols-2 lg:pb-40">
        <div className="relative z-10 min-w-0 text-center lg:text-left">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm text-amber-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> {t(h.badge)}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 text-[2rem] font-bold leading-tight tracking-tight sm:text-5xl xl:text-[3.6rem]">
            {t(h.title1)}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mx-auto mt-5 max-w-xl bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-xl font-semibold leading-snug text-transparent sm:text-2xl lg:mx-0">
            {t(h.title2)}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-8 flex flex-col items-center gap-3 lg:items-start">
            <p className="text-sm text-slate-400">{t(h.try)}</p>
            <CallWidget lang={lang} onLevel={onLevel} onPhase={onPhase} onAgentState={onAgentState} />
            <Link href="/portal" className="mt-1 text-sm text-slate-400 underline-offset-4 hover:text-amber-300 hover:underline">{t(h.portalCta)}</Link>
          </motion.div>
        </div>

        <div className="relative h-[340px] min-w-0 sm:h-[460px] lg:h-[560px]">
          <AvatarBoy voice={voice} />
          {h.chips.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }}
              transition={{ delay: 0.5 + i * 0.15, y: { repeat: Infinity, duration: 4 + i, ease: "easeInOut" } }}
              className={`pointer-events-none absolute hidden rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 shadow-xl backdrop-blur-md sm:block ${["left-0 top-10", "right-0 top-1/3", "bottom-16 left-4"][i]}`}
            >
              <p className="text-sm font-semibold">{i === 0 && <span className="mr-1 text-emerald-400">✓</span>}{t(c)}</p>
              <p className="text-xs text-slate-400">{t(c.sub)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
