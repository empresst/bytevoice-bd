"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "bn" | "en";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "bn", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("bn");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bv-lang");
      // Read after hydration so server and first client render match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "bn" || saved === "en") setLangState(saved);
    } catch {}
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try { localStorage.setItem("bv-lang", l); } catch {}
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** t({bn, en}) picks the current language. */
export function useT() {
  const { lang } = useLang();
  return <T,>(s: { bn: T; en: T }) => s[lang];
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div role="group" aria-label="Language" className="flex rounded-full bg-white/10 p-0.5 text-xs font-semibold">
      {(["bn", "en"] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-full px-3 py-1.5 transition ${lang === l ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"}`}>
          {l === "bn" ? "বাংলা" : "EN"}
        </button>
      ))}
    </div>
  );
}
