"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Radio,
  Clock,
  Compass,
} from "lucide-react";
import type { QueryResponse } from "@/lib/types";
import { languageName, audioDataUri } from "@/lib/utils";

interface SafetyAdvisoryCardProps {
  response: QueryResponse | null | undefined;
  userCoords: { lat: number; lon: number };
}

export function SafetyAdvisoryCard({ response, userCoords }: SafetyAdvisoryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [response]);

  if (!response) {
    return (
      <div className="bg-ocean-800/90 border border-dashed border-ocean-600/80 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[260px] backdrop-blur-md shadow-md">
        <div className="w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
          <Compass size={24} className="animate-spin-slow" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">
            Awaiting Marine Inquiry
          </h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
            Ask ORCA about sea tranquility, wave height swells, or safe passage corridors from your anchor.
          </p>
        </div>
      </div>
    );
  }

  // Verdict config
  const verdictColor = response.verdict_color || "green";
  const verdictConfigs = {
    green: {
      badgeText: "SAFE TO SAIL",
      subtext: "All oceanographic & border parameters within safe operating thresholds.",
      badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.2)]",
      icon: ShieldCheck,
      borderClass: "border-l-4 border-l-emerald-400",
    },
    amber: {
      badgeText: "CAUTION ADVISED",
      subtext: "Moderate sea swells, gusting winds, or proximity to boundary geofence.",
      badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-[0_0_15px_rgba(251,191,36,0.2)]",
      icon: AlertTriangle,
      borderClass: "border-l-4 border-l-amber-400",
    },
    red: {
      badgeText: "DANGER: HARBOR STAY",
      subtext: "Severe swell warnings, cyclone circulation, or critical boundary breach hazard.",
      badgeClass: "bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(248,113,113,0.2)]",
      icon: AlertOctagon,
      borderClass: "border-l-4 border-l-red-400",
    },
  };

  const currentVerdict = verdictConfigs[verdictColor] || verdictConfigs.green;
  const VerdictIcon = currentVerdict.icon;

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn("Audio play blocked, using browser speech fallback:", e);
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            const utter = new SpeechSynthesisUtterance(response.final_response);
            utter.onend = () => setIsPlaying(false);
            window.speechSynthesis.speak(utter);
            setIsPlaying(true);
          }
        });
    }
  };

  const lang = response.detected_language ? languageName(response.detected_language) : "English";

  return (
    <div className={`bg-ocean-800/90 border border-ocean-600/70 rounded-xl p-4 sm:p-5 shadow-lg backdrop-blur-md transition-all ${currentVerdict.borderClass}`}>
      {/* Hidden audio element if audio_base64 provided */}
      {response.audio_base64 && (
        <audio
          ref={audioRef}
          src={audioDataUri(response.audio_base64)}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Header: Large colored verdict badge + Language indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-xs sm:text-sm tracking-wide ${currentVerdict.badgeClass}`}>
          <VerdictIcon size={18} className="shrink-0" />
          <span>{currentVerdict.badgeText}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Detected Language Pill */}
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-400/10 border border-cyan-400/30 px-2 py-0.5 rounded-full">
            {lang}
          </span>

          {/* Audio TTS Button */}
          <button
            type="button"
            onClick={toggleAudio}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition active:scale-95 ${
              isPlaying
                ? "bg-amber-400 text-ocean-900 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)] animate-pulse"
                : "bg-ocean-700/80 hover:bg-ocean-600 text-slate-200 border-ocean-600 hover:text-cyan-400"
            }`}
            title="Listen to synthesized spoken audio advisory"
            aria-label={isPlaying ? "Pause voice advisory" : "Listen to voice advisory"}
          >
            {isPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{isPlaying ? "Playing..." : "Listen"}</span>
          </button>
        </div>
      </div>

      {/* Advisory Paragraph */}
      <div className="mt-2 text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-sans">
        {response.final_response}
      </div>

      {/* Collapsible Evidence Ledger */}
      {response.evidence && response.evidence.length > 0 && (
        <div className="mt-4 pt-3 border-t border-ocean-700/70">
          <button
            type="button"
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center justify-between w-full text-xs font-mono font-semibold text-slate-400 hover:text-cyan-400 transition"
          >
            <div className="flex items-center gap-1.5">
              <Radio size={13} className="text-cyan-400" />
              <span>Telemetry Evidence Ledger ({response.evidence.length} sources)</span>
            </div>
            {showEvidence ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showEvidence && (
            <div className="mt-2.5 space-y-2">
              {response.evidence.map((ev, idx) => (
                <div
                  key={idx}
                  className="bg-ocean-900/80 border border-ocean-700 rounded-lg p-2.5 text-xs text-slate-300"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] text-cyan-400 mb-1">
                    <span className="font-semibold">{ev.source}</span>
                    <span className="text-slate-500">{ev.as_of}</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{ev.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
