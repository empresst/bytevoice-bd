"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Re-renders the page when calls, extractions or callbacks change (Supabase Realtime). */
export function LiveRefresh({ tables = ["calls", "call_extractions", "callbacks", "transcript_turns"] }: { tables?: string[] }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };
    const channel = supabase.channel("portal-live");
    tables.forEach((table) => channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh));
    channel.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [router, tables]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live
    </span>
  );
}
