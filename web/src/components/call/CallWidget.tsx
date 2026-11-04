"use client";

import {
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
  useTrackVolume,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { MediaDeviceFailure, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

export type CallPhase = "idle" | "connecting" | "waiting" | "live" | "ended" | "error";
export type CallError = "mic_denied" | "no_mic" | "rate_limited" | "network" | "agent_timeout" | "unknown";

export const ERROR_TEXT: Record<CallError, { bn: string; en: string }> = {
  mic_denied: { bn: "মাইক্রোফোনের অনুমতি দেওয়া হয়নি। ব্রাউজারের ঠিকানার পাশের 🔒 আইকনে ক্লিক করে মাইক চালু করুন।", en: "Microphone access was blocked. Allow it from the 🔒 icon next to the address bar." },
  no_mic: { bn: "কোনো মাইক্রোফোন পাওয়া যায়নি।", en: "No microphone was found on this device." },
  rate_limited: { bn: "এই নেটওয়ার্ক থেকে অনেকবার কল করা হয়েছে। একটু পরে আবার চেষ্টা করুন।", en: "Too many demo calls from this network. Please try again later." },
  network: { bn: "সংযোগে সমস্যা হচ্ছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।", en: "Connection problem. Check your internet and try again." },
  agent_timeout: { bn: "রিসেপশনিস্ট এই মুহূর্তে সংযুক্ত হতে পারছে না। আবার চেষ্টা করুন।", en: "The receptionist could not join right now. Please try again." },
  unknown: { bn: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।", en: "Something went wrong. Please try again." },
};

const AGENT_JOIN_TIMEOUT_MS = 30_000; // includes a cold start of the hosted agent

type Props = {
  /** Agent voice level 0..1, ~60 times a second, for the 3D hero. */
  onLevel?: (level: number) => void;
  onPhase?: (phase: CallPhase) => void;
  lang?: "bn" | "en";
};

export function useBanglaCall({ onPhase }: { onPhase?: (p: CallPhase) => void } = {}) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [phase, setPhaseState] = useState<CallPhase>("idle");
  const [error, setError] = useState<CallError | null>(null);
  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhase = useCallback((p: CallPhase) => { setPhaseState(p); onPhase?.(p); }, [onPhase]);

  const fail = useCallback(async (e: CallError) => {
    if (joinTimer.current) clearTimeout(joinTimer.current);
    setError(e);
    setPhase("error");
    await room.disconnect();
  }, [room, setPhase]);

  useEffect(() => {
    const onAgent = () => {
      if (joinTimer.current) clearTimeout(joinTimer.current);
      setPhase("live");
    };
    const onDisconnected = () => setPhaseState((p) => (p === "error" ? p : "ended"));
    const onMediaFailure = (e: Error) => {
      const f = MediaDeviceFailure.getFailure(e);
      void fail(f === MediaDeviceFailure.PermissionDenied ? "mic_denied" : f === MediaDeviceFailure.NotFound ? "no_mic" : "unknown");
    };
    room.on(RoomEvent.ParticipantConnected, (p) => p.isAgent && onAgent());
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.MediaDevicesError, onMediaFailure);
    return () => { room.removeAllListeners(); void room.disconnect(); };
  }, [room, fail, setPhase]);

  const start = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    // Ask for the mic first so a denied permission is reported clearly.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      return fail((e as DOMException)?.name === "NotFoundError" ? "no_mic" : "mic_denied");
    }
    let res: Response;
    try {
      res = await fetch("/api/call", { method: "POST" });
    } catch {
      return fail("network");
    }
    if (res.status === 429) return fail("rate_limited");
    if (!res.ok) return fail("unknown");
    const { token, url } = (await res.json()) as { token: string; url: string };
    try {
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch {
      return fail("network");
    }
    if ([...room.remoteParticipants.values()].some((p) => p.isAgent)) setPhase("live");
    else {
      setPhase("waiting");
      joinTimer.current = setTimeout(() => void fail("agent_timeout"), AGENT_JOIN_TIMEOUT_MS);
    }
  }, [room, fail, setPhase]);

  const end = useCallback(async () => {
    if (joinTimer.current) clearTimeout(joinTimer.current);
    await room.disconnect();
    setPhase("ended");
  }, [room, setPhase]);

  return { room, phase, error, start, end };
}

/** Everything that needs the room context: audio playback, captions, voice level. */
export function CallSurface({ onLevel, lang = "bn" }: Pick<Props, "onLevel" | "lang">) {
  const { state, audioTrack } = useVoiceAssistant();
  const level = useTrackVolume(audioTrack);
  const transcriptions = useTranscriptions();

  useEffect(() => { onLevel?.(level); }, [level, onLevel]);

  const last = transcriptions.slice(-2);
  const stateText: Record<string, { bn: string; en: string }> = {
    listening: { bn: "শুনছি…", en: "Listening…" },
    thinking: { bn: "ভাবছি…", en: "Thinking…" },
    speaking: { bn: "বলছি…", en: "Speaking…" },
  };

  return (
    <>
      <RoomAudioRenderer />
      <StartAudio label={lang === "bn" ? "শব্দ চালু করুন" : "Click to enable audio"} className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900" />
      <p className="text-xs uppercase tracking-widest text-amber-300/90" aria-live="polite">
        {stateText[state]?.[lang] ?? ""}
      </p>
      <div className="min-h-[3.5rem] space-y-1 text-center" aria-live="polite">
        {last.map((t) => (
          <p key={t.streamInfo.id} className={t.participantInfo.identity.startsWith("visitor") ? "text-sm text-slate-300" : "text-base text-white"}>
            {t.text}
          </p>
        ))}
      </div>
    </>
  );
}

export function CallWidget({ onLevel, onPhase, lang = "bn" }: Props) {
  const { room, phase, error, start, end } = useBanglaCall({ onPhase });
  const busy = phase === "connecting" || phase === "waiting";
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <RoomContext.Provider value={room}>
      <div className="flex flex-col items-center gap-3">
        {phase === "live" ? (
          <>
            <CallSurface onLevel={onLevel} lang={lang} />
            <button onClick={end} className="rounded-full bg-rose-500 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-rose-400">
              {t("কল শেষ করুন", "End call")}
            </button>
          </>
        ) : (
          <button
            onClick={start}
            disabled={busy}
            className="group relative rounded-full bg-amber-400 px-8 py-4 text-lg font-bold text-slate-900 shadow-[0_0_40px_rgba(251,191,36,0.35)] transition hover:scale-[1.03] hover:bg-amber-300 disabled:cursor-wait disabled:opacity-80"
          >
            {phase === "connecting" && t("সংযোগ হচ্ছে…", "Connecting…")}
            {phase === "waiting" && t("রিসেপশনিস্টকে ডাকা হচ্ছে…", "Calling the receptionist…")}
            {(phase === "idle" || phase === "error") && t("বাংলা কলারের সাথে কথা বলুন", "Talk to our Bangla caller")}
            {phase === "ended" && t("আবার কল করুন", "Call again")}
          </button>
        )}
        {phase === "ended" && (
          <p className="text-sm text-slate-300">{t("কল শেষ হয়েছে। ধন্যবাদ!", "Call ended. Thank you!")}</p>
        )}
        {phase === "error" && error && (
          <p role="alert" className="max-w-sm text-center text-sm text-rose-300">{ERROR_TEXT[error][lang]}</p>
        )}
        {phase === "idle" && (
          <p className="text-xs text-slate-400">{t("ব্রাউজারে লাইভ কল · মাইক্রোফোন লাগবে", "Live call in your browser · needs microphone")}</p>
        )}
      </div>
    </RoomContext.Provider>
  );
}
