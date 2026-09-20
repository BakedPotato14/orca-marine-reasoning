"use client";

import React, { useState, useMemo } from "react";
import { OceanStatsBar } from "@/components/OceanStatsBar";
import { MapPanel } from "@/components/MapPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { AdvisoryCard } from "@/components/AdvisoryCard";
import { LocationPicker } from "@/components/LocationPicker";
import { useOceanSummary } from "@/hooks/useOceanSummary";
import { usePFZGeoJSON } from "@/hooks/usePFZData";
import { useORCAQuery } from "@/hooks/useORCAQuery";
import { haversineDistanceKm } from "@/lib/utils";

export default function DashboardPage() {
  const { summary, isLoading: isSummaryLoading, refreshData, isRefreshing } = useOceanSummary();
  const { geoJson: pfzGeoJson } = usePFZGeoJSON();
  const {
    location,
    setLocation,
    history,
    currentResponse,
    isLoading: isQueryLoading,
    askQuestion,
    transcribeAudio,
    clearHistory,
  } = useORCAQuery();

  const [activeTab, setActiveTab] = useState<"advisory" | "chat">("advisory");

  // Dynamic PFZ count within 100km radius of active departure/query coordinates
  const localPfzCount = useMemo(() => {
    if (!pfzGeoJson?.features || !location) return undefined;
    return pfzGeoJson.features.reduce((acc, feat) => {
      if (feat.geometry?.type === "Point" && Array.isArray(feat.geometry.coordinates)) {
        const coords = feat.geometry.coordinates as number[];
        const fLon = coords[0];
        const fLat = coords[1];
        if (typeof fLat === "number" && typeof fLon === "number") {
          if (haversineDistanceKm(location.lat, location.lon, fLat, fLon) <= 100) {
            return acc + 1;
          }
        }
      }
      return acc;
    }, 0);
  }, [pfzGeoJson, location]);

  const handleSendQuery = async (query: string) => {
    setActiveTab("advisory");
    await askQuestion(query, location.lat, location.lon);
  };

  return (
    <div style={{ padding: "16px 24px", maxWidth: "1800px", margin: "0 auto" }}>
      {/* Real-time oceanographic telemetry summary bar — location-aware */}
      <OceanStatsBar
        summary={summary}
        pfzGeoJson={pfzGeoJson}
        location={location}
        isLoading={isSummaryLoading}
        isRefreshing={isRefreshing}
        onRefresh={refreshData}
      />

      {/* Main Split Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(500px, 1.15fr) minmax(420px, 1fr)",
          gap: "20px",
          alignItems: "start",
        }}
        className="dashboard-grid"
      >
        {/* Left Column: Folium Map Panel & Departure Location Picker */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <LocationPicker
            location={location}
            onChange={(loc) => setLocation(loc)}
          />

          <MapPanel
            initialTab="ocean"
            height="620px"
            localPfzCount={localPfzCount}
          />
        </div>

        {/* Right Column: Advisory Synthesis & Interactive AI Chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Sub-tab navigation for mobile / compact viewing if needed */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px",
              backgroundColor: "rgba(18, 22, 32, 0.7)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              width: "fit-content",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("advisory")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                backgroundColor: activeTab === "advisory" ? "var(--accent-cyan)" : "transparent",
                color: activeTab === "advisory" ? "#0a0c10" : "var(--text-secondary)",
                transition: "all 0.15s ease",
              }}
            >
              Active Advisory
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                backgroundColor: activeTab === "chat" ? "var(--accent-cyan)" : "transparent",
                color: activeTab === "chat" ? "#0a0c10" : "var(--text-secondary)",
                transition: "all 0.15s ease",
              }}
            >
              Conversation History ({history.length})
            </button>
          </div>

          {/* Active Advisory Card view */}
          {activeTab === "advisory" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <AdvisoryCard
                response={currentResponse}
                userCoords={location}
              />

              {/* Chat Input attached at bottom of Advisory for rapid follow-ups */}
              <ChatPanel
                history={history}
                isLoading={isQueryLoading}
                onSend={handleSendQuery}
                onTranscribe={transcribeAudio}
                onClear={clearHistory}
                onSelectResponse={() => setActiveTab("advisory")}
              />
            </div>
          ) : (
            <ChatPanel
              history={history}
              isLoading={isQueryLoading}
              onSend={handleSendQuery}
              onTranscribe={transcribeAudio}
              onClear={clearHistory}
              onSelectResponse={() => setActiveTab("advisory")}
            />
          )}
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
