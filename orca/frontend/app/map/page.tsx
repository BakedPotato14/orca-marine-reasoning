"use client";

import React from "react";
import { MapPanel } from "@/components/MapPanel";
import { OceanStatsBar } from "@/components/OceanStatsBar";
import { useOceanSummary } from "@/hooks/useOceanSummary";

export default function MapExplorerPage() {
  const { summary, isLoading, refreshData, isRefreshing } = useOceanSummary();

  return (
    <div style={{ padding: "16px 24px", maxWidth: "1800px", margin: "0 auto", height: "calc(100vh - 72px)", display: "flex", flexDirection: "column" }}>
      <OceanStatsBar
        summary={summary}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={refreshData}
      />

      <div style={{ flex: 1, minHeight: "500px" }}>
        <MapPanel
          initialTab="ocean"
          height="100%"
        />
      </div>
    </div>
  );
}
