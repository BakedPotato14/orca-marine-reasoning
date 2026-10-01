"use client";

import React from "react";
import type { EvidenceCard } from "@/lib/types";
import { CloudRain, Shield, Fish, Clock, Database } from "lucide-react";

interface EvidenceCardsProps {
  evidence: EvidenceCard[];
}

export function EvidenceCards({ evidence }: EvidenceCardsProps) {
  if (!evidence || evidence.length === 0) return null;

  const getSourceIcon = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes("weather") || s.includes("meteo") || s.includes("wind") || s.includes("wave")) {
      return <CloudRain size={16} color="var(--accent-cyan)" />;
    }
    if (s.includes("geofence") || s.includes("imbl") || s.includes("boundary") || s.includes("eez")) {
      return <Shield size={16} color="var(--accent-amber)" />;
    }
    if (s.includes("pfz") || s.includes("fish") || s.includes("incois")) {
      return <Fish size={16} color="var(--accent-emerald)" />;
    }
    return <Database size={16} color="var(--accent-blue)" />;
  };

  return (
    <div style={{ marginTop: "14px" }}>
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          marginBottom: "8px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>Telemetry & Advisory Evidence</span>
        <span
          style={{
            fontSize: "0.65rem",
            backgroundColor: "rgba(212, 175, 55, 0.08)",
            border: "1px solid rgba(212, 175, 55, 0.2)",
            padding: "1px 8px",
            borderRadius: "4px",
            color: "var(--accent-gold)",
          }}
        >
          {evidence.length} sources
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "10px",
        }}
      >
        {evidence.map((item, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: "rgba(22, 24, 28, 0.75)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {getSourceIcon(item.source)}
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {item.source}
                </span>
              </div>
              {item.as_of && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    fontSize: "0.68rem",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <Clock size={11} />
                  <span>{item.as_of}</span>
                </div>
              )}
            </div>

            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.48 }}>
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
