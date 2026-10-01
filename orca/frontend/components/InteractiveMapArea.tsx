"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Layers,
  Fish,
  ShieldAlert,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Satellite,
  Radio,
  Eye,
  Check,
} from "lucide-react";
import type { TileStyle, MapOverlaySettings } from "./InteractiveLeafletMap";
import type { GeoJSONFeatureCollection } from "@/lib/types";

// Dynamic import with SSR disabled for Leaflet to prevent window/navigator hydration errors
const DynamicLeafletMap = dynamic(() => import("./InteractiveLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[580px] bg-ocean-900 flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      <span className="text-xs font-mono text-cyan-400">Loading Nautical Canvas...</span>
    </div>
  ),
});

interface InteractiveMapAreaProps {
  location: { lat: number; lon: number };
  pfzGeoJson?: GeoJSONFeatureCollection | null;
  advisoryGeoJson?: GeoJSONFeatureCollection | null;
  localPfzCount?: number;
  selectedHotspotCoords?: { lat: number; lon: number } | null;
  onSelectHotspot?: (coords: { lat: number; lon: number; id: string }) => void;
  onSetLocation?: (coords: { lat: number; lon: number }) => void;
}

export function InteractiveMapArea({
  location,
  pfzGeoJson,
  advisoryGeoJson,
  localPfzCount,
  selectedHotspotCoords,
  onSelectHotspot,
  onSetLocation,
}: InteractiveMapAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"ocean" | "pfz" | "safety">("ocean");
  const [mapMode, setMapMode] = useState<"vector" | "satellite_folium">("vector");
  const [tileStyle, setTileStyle] = useState<TileStyle>("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [safetySectors, setSafetySectors] = useState<any[]>([]);

  // Toggleable Overlays
  const [overlays, setOverlays] = useState<MapOverlaySettings>({
    showSST: true,
    showChl: true,
    showWaves: true,
    showPFZ: true,
    showSafety: true,
    showIMBL: true,
  });

  // Fetch safety hazard sectors from backend
  useEffect(() => {
    fetch("/api/geo/data/safety-alerts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sectors) {
          setSafetySectors(data.sectors);
        }
      })
      .catch(() => {});
  }, []);

  // Sync active tab to recommended overlay presets
  useEffect(() => {
    if (activeTab === "ocean") {
      setOverlays((prev) => ({
        ...prev,
        showSST: true,
        showChl: true,
        showWaves: true,
        showPFZ: true,
        showSafety: true,
        showIMBL: true,
      }));
    } else if (activeTab === "pfz") {
      setOverlays((prev) => ({ ...prev, showPFZ: true, showChl: true, showSST: true }));
    } else if (activeTab === "safety") {
      setOverlays((prev) => ({ ...prev, showSafety: true, showWaves: true, showIMBL: true }));
    }
  }, [activeTab]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const pfzDisplayCount = localPfzCount !== undefined ? localPfzCount : pfzGeoJson?.features?.length ?? 14;

  return (
    <div
      ref={containerRef}
      className={`glass-card flex flex-col overflow-hidden relative transition-all ${
        isFullscreen ? "h-screen w-screen rounded-none z-[9999]" : "h-[620px]"
      }`}
    >
      {/* 1. Top Tab Bar Above Map */}
      <div className="flex flex-wrap items-center justify-between p-2.5 px-3 sm:px-4 bg-ocean-900/90 border-b border-ocean-600/70 gap-2 z-10 backdrop-blur-md">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("ocean")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "ocean"
                ? "bg-cyan-400 text-ocean-900 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                : "text-slate-300 hover:text-white hover:bg-ocean-800"
            }`}
          >
            <Layers size={14} />
            <span>Ocean Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pfz")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "pfz"
                ? "bg-cyan-400 text-ocean-900 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                : "text-slate-300 hover:text-white hover:bg-ocean-800"
            }`}
          >
            <Fish size={14} />
            <span>PFZ Zones</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === "pfz" ? "bg-ocean-900 text-cyan-400" : "bg-cyan-400/20 text-cyan-300"
              }`}
            >
              {pfzDisplayCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("safety")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "safety"
                ? "bg-amber-400 text-ocean-900 shadow-[0_0_10px_rgba(251,191,36,0.3)]"
                : "text-slate-300 hover:text-white hover:bg-ocean-800"
            }`}
          >
            <ShieldAlert size={14} />
            <span>Safety & Hazards</span>
          </button>
        </div>

        {/* Right Map Toolbar: Engine Toggle + Tile Selector + Layers + Fullscreen */}
        <div className="flex items-center gap-1.5">
          {/* Engine: Vector Leaflet vs Copernicus Folium */}
          <div className="hidden sm:flex items-center bg-ocean-800 rounded-lg p-0.5 border border-ocean-600">
            <button
              type="button"
              onClick={() => setMapMode("vector")}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                mapMode === "vector"
                  ? "bg-cyan-400 text-ocean-900"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Interactive vector map with dynamic layers"
            >
              <Radio size={12} />
              <span>Canvas</span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode("satellite_folium")}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                mapMode === "satellite_folium"
                  ? "bg-cyan-400 text-ocean-900"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Copernicus Satellite NetCDF raster overlay"
            >
              <Satellite size={12} />
              <span>Copernicus</span>
            </button>
          </div>

          {/* Tile Selector (for vector mode) */}
          {mapMode === "vector" && (
            <select
              value={tileStyle}
              onChange={(e) => setTileStyle(e.target.value as TileStyle)}
              className="bg-ocean-800 border border-ocean-600 text-slate-200 text-xs rounded-lg px-2 py-1 focus:ring-1 focus:ring-cyan-400 outline-none cursor-pointer"
              aria-label="Map Tile Style"
            >
              <option value="dark">Carto Dark</option>
              <option value="light">Carto Light</option>
              <option value="osm">OpenStreetMap</option>
              <option value="satellite">ESRI Satellite</option>
            </select>
          )}

          {/* Layer Toggle Panel Button */}
          {mapMode === "vector" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition ${
                  showLayerMenu
                    ? "bg-cyan-400 text-ocean-900 border-cyan-400"
                    : "bg-ocean-800 text-slate-300 border-ocean-600 hover:text-white"
                }`}
                title="Toggle map overlay layers"
                aria-label="Toggle map overlay layers"
              >
                <SlidersHorizontal size={14} />
                <span className="hidden md:inline text-[11px]">Layers</span>
              </button>

              {/* Layer Popover Menu */}
              {showLayerMenu && (
                <div className="absolute right-0 top-9 w-52 bg-ocean-900/95 backdrop-blur-md border border-ocean-600 rounded-xl p-3 shadow-2xl z-50 text-xs space-y-2">
                  <div className="text-[11px] uppercase font-bold text-slate-400 border-b border-ocean-700 pb-1 mb-2">
                    Active Map Overlays
                  </div>

                  {[
                    { key: "showSST", label: "SST Heatmap Circles", color: "text-cyan-400" },
                    { key: "showChl", label: "Chlorophyll Fronts", color: "text-emerald-400" },
                    { key: "showWaves", label: "Significant Wave Sectors", color: "text-cyan-400" },
                    { key: "showPFZ", label: "PFZ Cluster Badges", color: "text-amber-400" },
                    { key: "showSafety", label: "Hazard Advisory Triangles", color: "text-red-400" },
                    { key: "showIMBL", label: "IMBL Geofence Line", color: "text-red-400" },
                  ].map((layer) => {
                    const isChecked = overlays[layer.key as keyof MapOverlaySettings];
                    return (
                      <label
                        key={layer.key}
                        className="flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-ocean-800"
                      >
                        <span className={`font-medium ${layer.color}`}>{layer.label}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setOverlays((prev) => ({
                              ...prev,
                              [layer.key]: !prev[layer.key as keyof MapOverlaySettings],
                            }))
                          }
                          className="rounded bg-ocean-700 border-ocean-600 text-cyan-400 focus:ring-0 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-ocean-800 border border-ocean-600 text-slate-300 hover:text-white transition"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* 2. Map Viewport Canvas */}
      <div className="flex-1 w-full relative overflow-hidden bg-ocean-900">
        {mapMode === "vector" ? (
          <DynamicLeafletMap
            lat={location.lat}
            lon={location.lon}
            tileStyle={tileStyle}
            overlays={overlays}
            pfzGeoJson={pfzGeoJson}
            safetySectors={safetySectors}
            advisoryGeoJson={advisoryGeoJson}
            selectedHotspotCoords={selectedHotspotCoords}
            onSelectHotspot={onSelectHotspot}
            onSetLocation={onSetLocation}
            height="100%"
          />
        ) : (
          <iframe
            src={
              activeTab === "pfz"
                ? "/api/geo/maps/pfz"
                : activeTab === "safety"
                ? "/api/geo/maps/safety"
                : "/api/geo/maps/ocean"
            }
            title="Copernicus Marine Satellite Raster Overlay"
            className="w-full h-full border-none"
            loading="lazy"
          />
        )}

        {/* 3. Color Legend Bars Docked at Bottom */}
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto bg-ocean-900/90 backdrop-blur-md border border-ocean-600/80 rounded-xl p-2.5 px-3 z-[400] text-xs shadow-xl flex flex-wrap items-center gap-4 sm:gap-6 pointer-events-auto">
          {/* SST Legend */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>SST Scale</span>
              <span>24°C ── 32°C</span>
            </div>
            <div className="w-28 sm:w-32 h-2 rounded-full bg-gradient-to-r from-cyan-400 via-amber-400 to-red-400 shadow-inner" />
          </div>

          {/* Chlorophyll Legend */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Chl-a Front</span>
              <span>0.05 ── 5.0 mg/m³</span>
            </div>
            <div className="w-28 sm:w-32 h-2 rounded-full bg-gradient-to-r from-blue-700 via-teal-400 to-emerald-400 shadow-inner" />
          </div>

          {/* Wave Hazard Legend */}
          <div className="hidden md:flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Wave State</span>
              <span>0.5m ── 4.0m+</span>
            </div>
            <div className="w-24 sm:w-28 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 shadow-inner" />
          </div>
        </div>
      </div>
    </div>
  );
}
