"use client";

import React from "react";
import type { DiagnosticData } from "@/lib/types";
import { Activity, AlertTriangle, TrendingDown, ThermometerSnowflake, Droplets } from "lucide-react";

interface DiagnosticCardProps {
  data: DiagnosticData | null | undefined;
}

export function DiagnosticCard({ data }: DiagnosticCardProps) {
  if (!data) return null;

  return (
    <div
      style={{
        marginTop: "16px",
        backgroundColor: "rgba(25, 20, 35, 0.6)",
        border: "1px solid rgba(255, 214, 0, 0.25)",
        borderRadius: "8px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity size={17} color="var(--accent-amber)" />
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              color: "var(--accent-amber)",
            }}
          >
            Ecological Trend Diagnostic
          </span>
        </div>

        {data.trend && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              backgroundColor: "rgba(255, 214, 0, 0.12)",
              color: "var(--accent-amber)",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "0.72rem",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }}
          >
            <TrendingDown size={13} />
            <span style={{ textTransform: "uppercase" }}>{data.trend} Trend</span>
          </div>
        )}
      </div>

      {/* Mandatory Regulatory Disclaimer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "rgba(255, 214, 0, 0.08)",
          border: "1px dashed rgba(255, 214, 0, 0.4)",
          borderRadius: "6px",
          padding: "6px 10px",
          color: "#ffe082",
          fontSize: "0.74rem",
          fontFamily: "var(--font-mono)",
        }}
      >
        <AlertTriangle size={15} style={{ flexShrink: 0, color: "var(--accent-amber)" }} />
        <span>
          ⚠️ Illustrative example data — not derived from live historical records.
        </span>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginTop: "4px" }}>
        {data.sst_anomaly_c !== undefined && (
          <div
            style={{
              backgroundColor: "rgba(10, 12, 16, 0.6)",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              <ThermometerSnowflake size={13} color="var(--accent-cyan)" />
              SST Anomaly
            </div>
            <div className="mono" style={{ fontSize: "1.05rem", fontWeight: 700, color: data.sst_anomaly_c > 0 ? "var(--accent-red)" : "var(--accent-cyan)", marginTop: "2px" }}>
              {data.sst_anomaly_c > 0 ? `+${data.sst_anomaly_c.toFixed(2)}` : data.sst_anomaly_c.toFixed(2)}°C
            </div>
          </div>
        )}

        {data.chlorophyll_drop_pct !== undefined && (
          <div
            style={{
              backgroundColor: "rgba(10, 12, 16, 0.6)",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              <Droplets size={13} color="var(--accent-emerald)" />
              Chlorophyll Shift
            </div>
            <div className="mono" style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--accent-amber)", marginTop: "2px" }}>
              -{data.chlorophyll_drop_pct}%
            </div>
          </div>
        )}
      </div>

      {/* Causal Factors */}
      {data.causal_factors && data.causal_factors.length > 0 && (
        <div style={{ marginTop: "4px" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
            Observed Ecological Drivers
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {data.causal_factors.map((factor, idx) => (
              <li key={idx} style={{ marginBottom: "2px" }}>
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
