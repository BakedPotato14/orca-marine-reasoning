"use client";

import React, { useState } from "react";
import { LocateFixed, Edit3, Check, X, Anchor, MessageSquare, ShieldCheck, MapPin } from "lucide-react";
import { formatCoord } from "@/lib/utils";

interface LocationBarProps {
  location: { lat: number; lon: number };
  onChange: (loc: { lat: number; lon: number }) => void;
  activeTab: "advisory" | "chat";
  onTabChange: (tab: "advisory" | "chat") => void;
  historyCount: number;
}

const HARBOR_PRESETS = [
  { name: "Mangalore (Panambur)", lat: 12.87, lon: 74.84 },
  { name: "Kochi (Wellington)", lat: 9.93, lon: 76.26 },
  { name: "Chennai (Royapuram)", lat: 13.08, lon: 80.29 },
  { name: "Mumbai (Sassoon)", lat: 18.92, lon: 72.82 },
  { name: "Visakhapatnam", lat: 17.68, lon: 83.21 },
  { name: "Kanyakumari", lat: 8.08, lon: 77.55 },
];

export function LocationBar({
  location,
  onChange,
  activeTab,
  onTabChange,
  historyCount,
}: LocationBarProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customLat, setCustomLat] = useState(location.lat.toString());
  const [customLon, setCustomLon] = useState(location.lon.toString());

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(4));
        const lon = parseFloat(pos.coords.longitude.toFixed(4));
        setCustomLat(lat.toString());
        setCustomLon(lon.toString());
        onChange({ lat, lon });
      },
      (err) => {
        setIsLocating(false);
        console.warn("Geolocation warning:", err.message);
        alert(`Location access denied or unavailable: ${err.message}`);
      },
      { timeout: 10000 }
    );
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      onChange({ lat, lon });
      setIsEditing(false);
    }
  };

  return (
    <div className="bg-ocean-800/90 border border-ocean-600/70 rounded-xl p-3 px-4 shadow-sm backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-sm">
      {/* Left: Port / Anchor Coordinates */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 text-slate-300">
          <Anchor size={16} className="text-cyan-400 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Departure Port / Anchor:
          </span>
          <span className="font-mono text-cyan-400 font-bold tracking-tight text-xs sm:text-sm bg-ocean-700/60 px-2.5 py-0.5 rounded border border-ocean-600/60">
            {formatCoord(location.lat, location.lon)}
          </span>
        </div>

        {/* Quick Port Preset Dropdown */}
        <select
          value={
            HARBOR_PRESETS.find(
              (p) => Math.abs(p.lat - location.lat) < 0.05 && Math.abs(p.lon - location.lon) < 0.05
            )?.name || "custom"
          }
          onChange={(e) => {
            const found = HARBOR_PRESETS.find((p) => p.name === e.target.value);
            if (found) {
              setCustomLat(found.lat.toString());
              setCustomLon(found.lon.toString());
              onChange({ lat: found.lat, lon: found.lon });
            }
          }}
          className="bg-ocean-700/80 border border-ocean-600 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-cyan-400 outline-none cursor-pointer"
          aria-label="Select departure harbor"
        >
          <option value="custom">Preset Harbors...</option>
          {HARBOR_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Action Buttons: GPS + Edit */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-400 border border-cyan-400/30 text-xs font-semibold transition active:scale-95 disabled:opacity-60 focus:outline-none"
            title="Acquire live GPS coordinates from device"
          >
            <LocateFixed size={13} className={isLocating ? "animate-spin text-cyan-400" : ""} />
            <span>{isLocating ? "Locating..." : "GPS Location"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ocean-700/70 hover:bg-ocean-600/70 text-slate-300 hover:text-white border border-ocean-600 text-xs font-medium transition active:scale-95 focus:outline-none"
            title="Edit coordinates manually"
          >
            <Edit3 size={13} />
            <span>Edit Coords</span>
          </button>
        </div>
      </div>

      {/* Right: Active Advisory vs Dialogue History Toggle Buttons */}
      <div className="flex items-center gap-1.5 bg-ocean-900/80 p-1 rounded-lg border border-ocean-600/60">
        <button
          type="button"
          onClick={() => onTabChange("advisory")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${
            activeTab === "advisory"
              ? "bg-amber-400 text-ocean-900 shadow-[0_0_10px_rgba(251,191,36,0.3)]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldCheck size={14} />
          <span>Active Advisory</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("chat")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${
            activeTab === "chat"
              ? "bg-cyan-400 text-ocean-900 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <MessageSquare size={14} />
          <span>Dialogue History</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === "chat" ? "bg-ocean-900 text-cyan-400" : "bg-ocean-700 text-slate-300"
            }`}
          >
            {historyCount}
          </span>
        </button>
      </div>

      {/* Inline Coordinates Editor Modal / Form */}
      {isEditing && (
        <form
          onSubmit={handleApplyCustom}
          className="w-full mt-2 pt-2 border-t border-ocean-600/50 flex flex-wrap items-center gap-2 text-xs"
        >
          <span className="text-slate-400 font-semibold">Custom Latitude (°N):</span>
          <input
            type="number"
            step="0.001"
            min="-90"
            max="90"
            value={customLat}
            onChange={(e) => setCustomLat(e.target.value)}
            className="w-24 px-2 py-1 rounded bg-ocean-900 border border-ocean-600 text-white font-mono outline-none focus:border-cyan-400"
          />

          <span className="text-slate-400 font-semibold ml-2">Longitude (°E):</span>
          <input
            type="number"
            step="0.001"
            min="-180"
            max="180"
            value={customLon}
            onChange={(e) => setCustomLon(e.target.value)}
            className="w-24 px-2 py-1 rounded bg-ocean-900 border border-ocean-600 text-white font-mono outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-400 text-ocean-900 font-bold hover:bg-cyan-300 transition"
          >
            <Check size={13} />
            <span>Apply</span>
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="p-1 rounded text-slate-400 hover:text-slate-200"
          >
            <X size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
