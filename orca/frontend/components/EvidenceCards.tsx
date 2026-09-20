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
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            padding: "1px 6px",
            borderRadius: "4px",
            color: "var(--accent-cyan)",
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
              backgroundColor: "rgba(18, 22, 32, 0.7)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              transition: "border-color 0.2s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 229, 255, 0.3)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
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

            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
