"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";

/* ------------------------------------------------------------------ */
/*  Voice catalogue (CPU-only engines)                                 */
/* ------------------------------------------------------------------ */

const VOICES = [
  { provider: "edge_tts", voice: "ne-NP-HemkalaNeural", label: "Hemkala", gender: "Female", engine: "Edge TTS" },
  { provider: "edge_tts", voice: "ne-NP-SagarNeural", label: "Sagar", gender: "Male", engine: "Edge TTS" },
  { provider: "piper", voice: "ne_NP-google-medium", label: "Google Medium", gender: "Female", engine: "Piper" },
  { provider: "piper", voice: "ne_NP-google-x_low", label: "Google X-Low", gender: "Female", engine: "Piper" },
  { provider: "piper", voice: "ne_NP-chitwan-medium", label: "Chitwan Medium", gender: "Male", engine: "Piper" },
  { provider: "mms_tts", voice: "nepali-male", label: "Nepali Male", gender: "Male", engine: "Nepali VITS" },
] as const;

/* ------------------------------------------------------------------ */
/*  Bilingual copy                                                     */
/* ------------------------------------------------------------------ */

const copy = {
  en: {
    placeholder: "Type Nepali text to compare voices...",
    generateAll: "Generate All",
    generatingAll: "Generating...",
    play: "Play",
    generate: "Generate",
    generating: "Generating...",
    charCount: (n: number, max: number) => `${n}/${max}`,
    ms: (n: number) => `${n} ms`,
    error: "Failed",
    gender: { Male: "Male", Female: "Female" } as Record<string, string>,
  },
  ne: {
    placeholder: "नेपाली पाठ टाइप गर्नुहोस्...",
    generateAll: "सबै उत्पन्न गर्नुहोस्",
    generatingAll: "उत्पन्न गर्दै...",
    play: "बजाउनुहोस्",
    generate: "उत्पन्न गर्नुहोस्",
    generating: "उत्पन्न गर्दै...",
    charCount: (n: number, max: number) => `${n}/${max}`,
    ms: (n: number) => `${n} ms`,
    error: "असफल",
    gender: { Male: "पुरुष", Female: "महिला" } as Record<string, string>,
  },
};

const DEFAULT_TEXT =
  "नमस्ते! AgentShakti मा स्वागत छ। हामी voice call र SMS automation सजिलो बनाउँछौं।";

const MAX_CHARS = 200;

/* ------------------------------------------------------------------ */
/*  Per-card state                                                     */
/* ------------------------------------------------------------------ */

type CardState = {
  loading: boolean;
  blobUrl: string | null;
  durationMs: number | null;
  error: boolean;
};

const emptyCard = (): CardState => ({
  loading: false,
  blobUrl: null,
  durationMs: null,
  error: false,
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type VoiceCompareProps = {
  language: LandingLanguage;
};

export default function VoiceCompare({ language }: VoiceCompareProps) {
  const t = copy[language];
  const [text, setText] = useState(DEFAULT_TEXT);
  const [cards, setCards] = useState<CardState[]>(() => VOICES.map(() => emptyCard()));
  const [allLoading, setAllLoading] = useState(false);

  // Keep blob URLs in a ref so we can revoke them on unmount
  const blobUrlsRef = useRef<(string | null)[]>(VOICES.map(() => null));

  // Audio element refs for controlling playback
  const audioRefs = useRef<(HTMLAudioElement | null)[]>(VOICES.map(() => null));

  /* Cleanup blob URLs on unmount */
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  /* ---- helpers ---- */

  const updateCard = useCallback((idx: number, patch: Partial<CardState>) => {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }, []);

  const synthesizeOne = useCallback(
    async (idx: number, inputText: string) => {
      const v = VOICES[idx];
      // Revoke previous blob if any
      const prev = blobUrlsRef.current[idx];
      if (prev) {
        URL.revokeObjectURL(prev);
        blobUrlsRef.current[idx] = null;
      }

      updateCard(idx, { loading: true, error: false, blobUrl: null, durationMs: null });

      try {
        const start = performance.now();
        const result = await api.synthesizeTTS({
          text: inputText,
          provider: v.provider,
          voice: v.voice,
        });
        const elapsed = Math.round(performance.now() - start);
        const url = URL.createObjectURL(result.audioBlob);
        blobUrlsRef.current[idx] = url;
        updateCard(idx, { loading: false, blobUrl: url, durationMs: elapsed });
      } catch {
        updateCard(idx, { loading: false, error: true });
      }
    },
    [updateCard],
  );

  /* ---- Generate All ---- */

  const handleGenerateAll = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || allLoading) return;
    setAllLoading(true);

    const promises = VOICES.map((_, idx) => synthesizeOne(idx, trimmed));
    await Promise.allSettled(promises);

    setAllLoading(false);
  }, [text, allLoading, synthesizeOne]);

  /* ---- Generate single ---- */

  const handleGenerateOne = useCallback(
    async (idx: number) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await synthesizeOne(idx, trimmed);
    },
    [text, synthesizeOne],
  );

  /* ---- Play (cached) ---- */

  const handlePlay = useCallback((idx: number) => {
    const el = audioRefs.current[idx];
    if (el) {
      el.currentTime = 0;
      el.play();
    }
  }, []);

  /* ---- Engine pill colour ---- */

  const engineColor = (engine: string): string => {
    switch (engine) {
      case "Edge TTS":
        return "border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "Piper":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "Nepali VITS":
        return "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
      default:
        return "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]";
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Textarea ---- */}
      <div className="relative">
        <textarea
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          rows={3}
          placeholder={t.placeholder}
          className="input-modern w-full px-4 py-3 text-sm"
        />
        <span className="absolute bottom-2 right-3 font-mono text-[10px] text-[var(--muted-foreground)]">
          {t.charCount(text.length, MAX_CHARS)}
        </span>
      </div>

      {/* ---- Generate All button ---- */}
      <button
        type="button"
        onClick={handleGenerateAll}
        disabled={!text.trim() || allLoading}
        className="btn-primary-modern inline-flex h-11 w-full items-center justify-center gap-2 px-5 text-sm font-medium disabled:opacity-50 sm:w-auto sm:self-start"
      >
        {allLoading && <Spinner />}
        {allLoading ? t.generatingAll : t.generateAll}
      </button>

      {/* ---- 2-column grid ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {VOICES.map((v, idx) => {
          const card = cards[idx];
          return (
            <motion.div
              key={v.voice}
              className="surface-card flex flex-col gap-3 rounded-2xl p-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              {/* Header row: engine pill + timing badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium ${engineColor(v.engine)}`}
                >
                  {v.engine}
                </span>
                {card.durationMs !== null && (
                  <span className="label-badge ml-auto py-0.5 text-[10px]">
                    {t.ms(card.durationMs)}
                  </span>
                )}
              </div>

              {/* Voice name + gender */}
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">{v.label}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t.gender[v.gender] ?? v.gender}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {card.blobUrl ? (
                  <button
                    type="button"
                    onClick={() => handlePlay(idx)}
                    className="btn-outline-modern inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
                  >
                    <PlayIcon />
                    {t.play}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleGenerateOne(idx)}
                    disabled={!text.trim() || card.loading}
                    className="btn-primary-modern inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    {card.loading && <Spinner />}
                    {card.loading ? t.generating : t.generate}
                  </button>
                )}

                {card.error && (
                  <span className="text-xs font-medium text-red-500">{t.error}</span>
                )}
              </div>

              {/* Hidden audio element for cached playback */}
              {card.blobUrl && (
                <audio
                  ref={(el) => {
                    audioRefs.current[idx] = el;
                  }}
                  controls
                  className="mt-1 h-8 w-full"
                >
                  <source src={card.blobUrl} />
                </audio>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tiny inline icons                                                  */
/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 2.5v11l9-5.5L4 2.5z" />
    </svg>
  );
}
