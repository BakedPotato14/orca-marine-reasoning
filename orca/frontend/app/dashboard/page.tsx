"use client";

import React, { useState, useMemo } from "react";
import { OceanStatsBar } from "@/components/OceanStatsBar";
import { LocationBar } from "@/components/LocationBar";
import { InteractiveMapArea } from "@/components/InteractiveMapArea";
import { SafetyAdvisoryCard } from "@/components/SafetyAdvisoryCard";
import { ForecastCharts } from "@/components/ForecastCharts";
import { PFZHotspotTable } from "@/components/PFZHotspotTable";
import { DialogueHistoryPanel } from "@/components/DialogueHistoryPanel";
import { VoiceChatBar } from "@/components/VoiceChatBar";
import { useOceanSummary } from "@/hooks/useOceanSummary";
import { usePFZGeoJSON, usePFZList } from "@/hooks/usePFZData";
import { useORCAQuery } from "@/hooks/useORCAQuery";
import { haversineDistanceKm } from "@/lib/utils";

export default function DashboardPage() {
  const { summary, isLoading: isSummaryLoading, isRefreshing } = useOceanSummary();
  const { geoJson: pfzGeoJson } = usePFZGeoJSON();
  const { hotspots, isLoading: isHotspotsLoading } = usePFZList({ limit: 40 });
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
  const [selectedHotspotCoords, setSelectedHotspotCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Dynamic PFZ count within 100km radius of active departure coordinates
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

  const handleSelectHotspot = (hotspot: { lat: number; lon: number; id: string }) => {
    setSelectedHotspotCoords({ lat: hotspot.lat, lon: hotspot.lon });
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-[1800px] w-full mx-auto p-3 sm:p-5 lg:p-6 gap-4">
      {/* 1. Ocean Stats Bar (5 Horizontal Cards, 2x2 on mobile) */}
      <OceanStatsBar
        summary={summary}
        pfzGeoJson={pfzGeoJson}
        location={location}
        isLoading={isSummaryLoading}
        isRefreshing={isRefreshing}
      />

      {/* 2. Location Bar (Anchor Coords, Presets, GPS, Edit Coords, View Mode Toggles) */}
      <LocationBar
        location={location}
        onChange={(loc) => {
          setLocation(loc);
          setSelectedHotspotCoords(null);
        }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        historyCount={history.length}
      />

      {/* 3. Main Split Grid (~65% Map on Left, ~35% Cards on Right; Stacks below 1024px) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Main Panel: Interactive Map Area (~65% width) */}
        <section
          aria-label="Interactive Nautical Map"
          className="lg:col-span-7 xl:col-span-8 w-full"
        >
          <InteractiveMapArea
            location={location}
            pfzGeoJson={pfzGeoJson}
            advisoryGeoJson={currentResponse?.map_geojson}
            localPfzCount={localPfzCount}
            selectedHotspotCoords={selectedHotspotCoords}
            onSelectHotspot={handleSelectHotspot}
            onSetLocation={setLocation}
          />
        </section>

        {/* Right Panel (~35% width): Safety Verdict, Forecast Charts, and PFZ Table */}
        <section
          aria-label="Marine Advisory & Forecast Telemetry"
          className="lg:col-span-5 xl:col-span-4 w-full flex flex-col gap-4"
        >
          {activeTab === "advisory" ? (
            <>
              {/* 4. Safety Verdict & Advisory Card */}
              <SafetyAdvisoryCard
                response={currentResponse}
                userCoords={location}
              />

              {/* 5. Forecast Charts (12h Wave Height & Wind Speed Area Charts) */}
              <ForecastCharts series={currentResponse?.forecast_series} />

              {/* 6. PFZ Hotspot Table */}
              <PFZHotspotTable
                hotspots={hotspots}
                isLoading={isHotspotsLoading}
                onSelectHotspot={handleSelectHotspot}
              />
            </>
          ) : (
            /* Dialogue History View */
            <DialogueHistoryPanel
              history={history}
              onClear={clearHistory}
              onSelectResponse={() => setActiveTab("advisory")}
              onSendSampleQuery={handleSendQuery}
            />
          )}
        </section>
      </div>

      {/* 4. Voice & Chat Bar (Sticky bottom dock) */}
      <VoiceChatBar
        onSend={handleSendQuery}
        onTranscribe={transcribeAudio}
        isLoading={isQueryLoading}
        audioBase64={currentResponse?.audio_base64}
      />
    </div>
  );
}
