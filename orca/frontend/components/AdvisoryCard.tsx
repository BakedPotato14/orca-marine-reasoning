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
          padding: "36px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: "14px",
          minHeight: "380px",
          border: "1px dashed var(--border)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "rgba(0, 229, 255, 0.08)",
            border: "1px solid rgba(0, 229, 255, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-cyan)",
          }}
        >
          <Navigation size={26} />
        </div>
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            Awaiting Marine Query
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "340px", margin: "0 auto" }}>
            Ask ORCA about sea safety, weather conditions, safe navigation routes, or active PFZ fishing hotspots.
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
        padding: "20px 22px",
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
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--border)",
                borderRadius: "9999px",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
              }}
            >
              <Globe size={13} color="var(--accent-cyan)" />
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
                title="Play cloud synthesized voice advisory"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: isPlaying ? "rgba(0, 230, 118, 0.2)" : "rgba(0, 229, 255, 0.1)",
                  border: isPlaying ? "1px solid var(--accent-emerald)" : "1px solid rgba(0, 229, 255, 0.3)",
                  color: isPlaying ? "var(--accent-emerald)" : "var(--accent-cyan)",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
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

          {/* On-Device Speech Button (Always available for low connectivity / edge fallback) */}
          <button
            type="button"
            onClick={toggleOnDeviceAudio}
            title="Read advisory aloud using device speech synthesizer (works offline)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: isOnDeviceSpeaking ? "rgba(255, 171, 0, 0.2)" : "rgba(255, 255, 255, 0.04)",
              border: isOnDeviceSpeaking ? "1px solid var(--accent-amber)" : "1px solid var(--border)",
              color: isOnDeviceSpeaking ? "var(--accent-amber)" : "var(--text-secondary)",
              borderRadius: "8px",
              padding: "6px 11px",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {isOnDeviceSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{isOnDeviceSpeaking ? "Stop On-Device" : "On-Device Voice"}</span>
          </button>
        </div>
      </div>

      {/* Main Advisory Narrative */}
      <div>
        <h4
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            marginBottom: "8px",
          }}
        >
          Synthesized Safety Advisory
        </h4>
        <div
          style={{
            fontSize: "0.92rem",
            lineHeight: 1.6,
            color: "var(--text-primary)",
            backgroundColor: "rgba(10, 12, 16, 0.5)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "14px 16px",
            whiteSpace: "pre-wrap",
          }}
        >
          {response.final_response}
        </div>
      </div>

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
