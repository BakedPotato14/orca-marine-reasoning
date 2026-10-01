"use client";

import React, { useState, useRef, useEffect } from "react";
import type { QueryResponse } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";
import { EvidenceCards } from "./EvidenceCards";
import { ForecastChart } from "./ForecastChart";
import { DiagnosticCard } from "./DiagnosticCard";
import { AdvisoryMap } from "./AdvisoryMap";
import { ErrorToast } from "./ErrorToast";
import { languageName, audioDataUri } from "@/lib/utils";
import { Volume2, VolumeX, Globe, Navigation, Play, Pause, RotateCcw } from "lucide-react";

interface AdvisoryCardProps {
  response: QueryResponse | null | undefined;
  userCoords: { lat: number; lon: number };
}

export function AdvisoryCard({ response, userCoords }: AdvisoryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isOnDeviceSpeaking, setIsOnDeviceSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio if response changes
  useEffect(() => {
    setIsPlaying(false);
    setIsOnDeviceSpeaking(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [response]);

  if (!response) {
    return (
      <div
        className="glass-card"
        style={{
          padding: "44px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: "16px",
          minHeight: "380px",
          border: "1px dashed var(--border)",
          backgroundColor: "rgba(22, 24, 28, 0.7)",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            backgroundColor: "rgba(212, 175, 55, 0.08)",
            border: "1px solid rgba(212, 175, 55, 0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-gold)",
            boxShadow: "0 0 20px rgba(212, 175, 55, 0.1)",
          }}
        >
          <Navigation size={26} strokeWidth={1.75} />
        </div>
        <div>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-serif)",
              letterSpacing: "0.04em",
              marginBottom: "6px",
            }}
          >
            Awaiting Marine Inquiry
          </h3>
          <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", maxWidth: "360px", margin: "0 auto", lineHeight: 1.6 }}>
            Consult ORCA on sea state tranquility, boundary zones, or active ocean frontal confluence for safe passage.
          </p>
        </div>
      </div>
    );
  }

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (isOnDeviceSpeaking && typeof window !== "undefined") {
        window.speechSynthesis.cancel();
        setIsOnDeviceSpeaking(false);
      }
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
        console.warn("Audio play blocked or failed:", e);
        setIsPlaying(false);
      });
    }
  };

  const toggleOnDeviceAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("On-device speech is not supported in this browser.");
      return;
    }

    if (isOnDeviceSpeaking) {
      window.speechSynthesis.cancel();
      setIsOnDeviceSpeaking(false);
      return;
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(response?.final_response || "");
    const langMap: Record<string, string> = {
      ta: "ta-IN",
      te: "te-IN",
      ml: "ml-IN",
      hi: "hi-IN",
      kn: "kn-IN",
      en: "en-IN",
    };
    utterance.lang = (response?.detected_language && langMap[response.detected_language]) || "en-IN";
    utterance.rate = 0.92;
    utterance.onend = () => setIsOnDeviceSpeaking(false);
    utterance.onerror = () => setIsOnDeviceSpeaking(false);

    setIsOnDeviceSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleReplay = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Top Advisory Header Strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          paddingBottom: "14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <VerdictBadge color={response.verdict_color} size="md" />

          {/* Language Badge */}
          {response.detected_language && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                backgroundColor: "rgba(220, 212, 198, 0.04)",
                border: "1px solid var(--border)",
                borderRadius: "9999px",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
              }}
            >
              <Globe size={13} color="var(--accent-gold)" />
              <span>{languageName(response.detected_language)}</span>
            </div>
          )}
        </div>

        {/* Voice TTS playback buttons: Server Audio + On-Device Edge Fallback */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {response.audio_base64 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <audio
                ref={audioRef}
                src={audioDataUri(response.audio_base64)}
                onEnded={() => setIsPlaying(false)}
              />
              <button
                type="button"
                onClick={toggleAudio}
                title="Play vocal guidance synthesized from marine knowledge"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: isPlaying ? "rgba(110, 156, 119, 0.2)" : "rgba(212, 175, 55, 0.1)",
                  border: isPlaying ? "1px solid var(--accent-emerald)" : "1px solid rgba(212, 175, 55, 0.35)",
                  color: isPlaying ? "var(--accent-emerald)" : "var(--accent-gold)",
                  borderRadius: "8px",
                  padding: "6px 13px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{isPlaying ? "Pause Voice" : "Play Advisory"}</span>
              </button>

              {isPlaying && (
                <button
                  type="button"
                  onClick={handleReplay}
                  title="Restart audio"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          )}

          {/* On-Device Speech Button */}
          <button
            type="button"
            onClick={toggleOnDeviceAudio}
            title="Read advisory aloud using device speech synthesizer (works offline)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: isOnDeviceSpeaking ? "rgba(200, 142, 56, 0.2)" : "rgba(220, 212, 198, 0.04)",
              border: isOnDeviceSpeaking ? "1px solid var(--accent-amber)" : "1px solid var(--border)",
              color: isOnDeviceSpeaking ? "var(--accent-amber)" : "var(--text-secondary)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {isOnDeviceSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{isOnDeviceSpeaking ? "Stop Voice" : "Device Voice"}</span>
          </button>
        </div>
      </div>

      {/* Main Advisory Narrative */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <h4
            style={{
              fontSize: "0.76rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              margin: 0,
            }}
          >
            Synthesized Safety Guidance
          </h4>
        </div>

        <div
          style={{
            fontSize: "0.93rem",
            lineHeight: 1.68,
            color: "var(--text-primary)",
            backgroundColor: "rgba(18, 20, 24, 0.7)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "16px 18px",
            whiteSpace: "pre-wrap",
            boxShadow: "inset 0 1px 4px rgba(0, 0, 0, 0.2)",
          }}
        >
          {response.final_response}
        </div>
      </div>

      <div className="kintsugi-divider" />

      {/* Standalone Advisory Chart / Route Map */}
      <div>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Navigation size={13} color="var(--accent-cyan)" />
            <span>Tactical Advisory Chart</span>
          </div>
          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "none", fontWeight: 400 }}>
            Direct heuristic projection — situational awareness only
          </span>
        </div>
        <AdvisoryMap
          lat={userCoords.lat}
          lon={userCoords.lon}
          geoJson={response.map_geojson}
          height="240px"
        />
      </div>

      {/* Telemetry Evidence Grid */}
      <EvidenceCards evidence={response.evidence} />

      {/* 12-Hour Sea State Forecast */}
      <ForecastChart series={response.forecast_series} />

      {/* Ecological Trend Diagnostic with Disclaimer */}
      <DiagnosticCard data={response.diagnostic_data} />

      {/* Non-fatal Errors */}
      {response.errors && response.errors.length > 0 && (
        <ErrorToast errors={response.errors} />
      )}
    </div>
  );
}
