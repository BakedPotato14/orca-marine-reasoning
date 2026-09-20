"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PFZTable } from "@/components/PFZTable";
import { MapPanel } from "@/components/MapPanel";
import { OceanStatsBar } from "@/components/OceanStatsBar";
import { usePFZList } from "@/hooks/usePFZData";
import { useOceanSummary } from "@/hooks/useOceanSummary";
import type { PFZHotspot } from "@/lib/types";

export default function PFZAdvisorPage() {
  const router = useRouter();
  const { summary, isLoading: isSummaryLoading, refreshData, isRefreshing } = useOceanSummary();
  const { hotspots, isLoading: isPFZLoading } = usePFZList({ limit: 50 });
  const [activeView, setActiveView] = useState<"table" | "map">("table");

  const handleSelectHotspot = (hotspot: PFZHotspot) => {
    // Navigate to dashboard to run an advisory check on this specific hotspot coordinate
    router.push(`/dashboard?lat=${hotspot.latitude}&lon=${hotspot.longitude}&species=${encodeURIComponent(hotspot.target_species || "")}`);
  };

  return (
    <div style={{ padding: "16px 24px", maxWidth: "1800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
      <OceanStatsBar
        summary={summary}
        isLoading={isSummaryLoading}
        isRefreshing={isRefreshing}
        onRefresh={refreshData}
      />

      {/* View Switcher */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(18, 22, 32, 0.7)",
            padding: "4px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveView("table")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: activeView === "table" ? "var(--accent-emerald)" : "transparent",
              color: activeView === "table" ? "#0a0c10" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            Hotspots Table View
          </button>
          <button
            type="button"
            onClick={() => setActiveView("map")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: activeView === "map" ? "var(--accent-emerald)" : "transparent",
              color: activeView === "map" ? "#0a0c10" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            PFZ Satellite Chart View
          </button>
        </div>

        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Showing {hotspots.length} evaluated oceanic frontal zones
        </div>
      </div>

      {activeView === "table" ? (
        <PFZTable
          hotspots={hotspots}
          isLoading={isPFZLoading}
          onSelectHotspot={handleSelectHotspot}
        />
      ) : (
        <div style={{ height: "650px" }}>
          <MapPanel initialTab="pfz" height="100%" />
        </div>
      )}
    </div>
  );
}
