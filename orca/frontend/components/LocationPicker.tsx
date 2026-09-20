"use client";

import React, { useState } from "react";
import { Navigation, MapPin } from "lucide-react";
import { formatCoord } from "@/lib/utils";

interface LocationPickerProps {
  location: { lat: number; lon: number };
  onChange: (loc: { lat: number; lon: number }) => void;
}

export function LocationPicker({ location, onChange }: LocationPickerProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [customLat, setCustomLat] = useState(location.lat.toString());
  const [customLon, setCustomLon] = useState(location.lon.toString());
  const [isEditing, setIsEditing] = useState(false);

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
    <div
      style={{
        backgroundColor: "rgba(18, 22, 32, 0.6)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MapPin size={16} color="var(--accent-cyan)" />
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Departure / Query Port:
          </span>
          <span className="mono" style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 600 }}>
            {formatCoord(location.lat, location.lon)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              backgroundColor: "rgba(0, 229, 255, 0.08)",
              border: "1px solid rgba(0, 229, 255, 0.3)",
              color: "var(--accent-cyan)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.75rem",
              cursor: isLocating ? "not-allowed" : "pointer",
            }}
          >
            <Navigation size={12} />
            <span>{isLocating ? "Locating..." : "GPS Location"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            {isEditing ? "Done" : "Edit Coords"}
          </button>
        </div>
      </div>

      {/* Manual Lat/Lon edit form */}
      {isEditing && (
        <form onSubmit={handleApplyCustom} style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "4px" }}>
          <input
            type="number"
            step="0.01"
            placeholder="Latitude"
            value={customLat}
            onChange={(e) => setCustomLat(e.target.value)}
            style={{
              width: "110px",
              padding: "4px 8px",
              backgroundColor: "rgba(10, 12, 16, 0.9)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
              fontFamily: "var(--font-mono)",
            }}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Longitude"
            value={customLon}
            onChange={(e) => setCustomLon(e.target.value)}
            style={{
              width: "110px",
              padding: "4px 8px",
              backgroundColor: "rgba(10, 12, 16, 0.9)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            type="submit"
            style={{
              backgroundColor: "var(--accent-cyan)",
              color: "#0a0c10",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
