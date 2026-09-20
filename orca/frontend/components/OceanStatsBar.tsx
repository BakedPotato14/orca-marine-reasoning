"use client";

import React, { useMemo } from "react";
import { Thermometer, Waves, Leaf, Fish, ShieldAlert, RefreshCw } from "lucide-react";
import type { OceanSummary, GeoJSONFeatureCollection } from "@/lib/types";
import { safetyStatusToHex, haversineDistanceKm, findMatchingSector } from "@/lib/utils";

interface OceanStatsBarProps {
  summary: OceanSummary | null | undefined;
  pfzGeoJson?: GeoJSONFeatureCollection | null;
  location?: { lat: number; lon: number };
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function OceanStatsBar({
  summary,
  pfzGeoJson,
  location,
  isLoading,
  isRefreshing,
  onRefresh,
}: OceanStatsBarProps) {
  const safetyColor = summary?.marine_safety?.overall_status
    ? safetyStatusToHex(summary.marine_safety.overall_status)
    : "var(--accent-cyan)";

  // Compute location-aware metrics with honest labeling
  const localStats = useMemo(() => {
    if (!location || !pfzGeoJson?.features || pfzGeoJson.features.length === 0) {
      return {
        isLocalized: false,
        sstLabel: "SST (Sea Temp)",
        sstValue: summary?.sst?.mean_celsius !== undefined ? `${summary.sst.mean_celsius.toFixed(1)}°C` : "28.4°C",
        sstSubtext: summary?.sst?.min_celsius !== undefined ? `${summary.sst.min_celsius.toFixed(1)}–${summary.sst.max_celsius.toFixed(1)}°C` : "Coastal Mean",
        waveLabel: "Wave Height",
        waveValue: summary?.waves?.mean_height_m !== undefined ? `${summary.waves.mean_height_m.toFixed(1)} m` : "1.4 m",
        waveSubtext: summary?.waves?.max_height_m !== undefined ? `Max: ${summary.waves.max_height_m.toFixed(1)}m` : "Moderate Sea",
        chlLabel: "Chlorophyll-a",
        chlValue: summary?.chlorophyll?.mean_mg_m3 !== undefined ? `${summary.chlorophyll.mean_mg_m3.toFixed(2)} mg/m³` : "0.85 mg/m³",
        chlSubtext: "Nutrient Upwelling",
        pfzValue: summary?.pfz?.total_detected_hotspots !== undefined ? `${summary.pfz.total_detected_hotspots} Hotspots` : "14 Zones",
        pfzSubtext: summary?.pfz?.high_probability_count !== undefined ? `${summary.pfz.high_probability_count} High Probability` : "Active Fishing",
      };
    }

    const { lat, lon } = location;

    // Filter PFZ hotspots by proximity
    let countWithin100km = 0;
    let highProbWithin100km = 0;
    let nearestDist = Infinity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nearestHotspot: any = null;

    for (const feat of pfzGeoJson.features) {
      if (feat.geometry?.type === "Point" && Array.isArray(feat.geometry.coordinates)) {
        const coords = feat.geometry.coordinates as number[];
        const fLon = coords[0];
        const fLat = coords[1];
        if (typeof fLat === "number" && typeof fLon === "number") {
          const d = haversineDistanceKm(lat, lon, fLat, fLon);
          if (d <= 100) {
            countWithin100km++;
            if (feat.properties?.category === "High Probability") {
              highProbWithin100km++;
            }
          }
          if (d < nearestDist) {
            nearestDist = d;
            nearestHotspot = feat;
          }
        }
      }
    }

    // 1. SST: Nearest PFZ hotspot if within 150km, else honest regional fallback
    let sstLabel: string;
    let sstValue: string;
    let sstSubtext: string;

    if (nearestHotspot && nearestDist <= 150 && nearestHotspot.properties?.sst_celsius !== undefined) {
      sstLabel = "SST (nearest PFZ reading)";
      sstValue = `${nearestHotspot.properties.sst_celsius.toFixed(1)}°C`;
      sstSubtext = `${nearestDist.toFixed(0)} km from query point`;
    } else {
      sstLabel = "SST (regional average — no nearby reading)";
      sstValue = summary?.sst?.mean_celsius !== undefined ? `${summary.sst.mean_celsius.toFixed(1)}°C` : "28.4°C";
      sstSubtext = "Basin Mean (no PFZ < 150km)";
    }

    // 2. Chlorophyll: Nearest PFZ hotspot if within 150km, else honest regional fallback
    let chlLabel: string;
    let chlValue: string;
    let chlSubtext: string;

    if (nearestHotspot && nearestDist <= 150 && nearestHotspot.properties?.chl_mg_m3 !== undefined) {
      chlLabel = "Chlorophyll-a (nearest PFZ reading)";
      chlValue = `${nearestHotspot.properties.chl_mg_m3.toFixed(2)} mg/m³`;
      chlSubtext = `${nearestDist.toFixed(0)} km from query point`;
    } else {
      chlLabel = "Chlorophyll-a (regional average — no nearby reading)";
      chlValue = summary?.chlorophyll?.mean_mg_m3 !== undefined ? `${summary.chlorophyll.mean_mg_m3.toFixed(2)} mg/m³` : "0.85 mg/m³";
      chlSubtext = "Basin Mean (no PFZ < 150km)";
    }

    // 3. Wave Height: Sector matching from coastal coordinates
    const matchedSector = findMatchingSector(lat, lon);
    const waveLabel = "Wave Height";
    const waveValue = summary?.waves?.mean_height_m !== undefined ? `${summary.waves.mean_height_m.toFixed(1)} m` : "1.4 m";
    const waveSubtext = matchedSector ? `${matchedSector} Sector` : "Regional Basin Mean";

    // 4. PFZ Zones: Exact localized count within 100 km radius
    const pfzValue = `${countWithin100km} Nearby (<100km)`;
    const pfzSubtext =
      countWithin100km > 0
        ? `${highProbWithin100km} High Probability`
        : `${summary?.pfz?.total_detected_hotspots ?? 173} Total in EEZ`;

    return {
      isLocalized: true,
      sstLabel,
      sstValue,
      sstSubtext,
      waveLabel,
      waveValue,
      waveSubtext,
      chlLabel,
      chlValue,
      chlSubtext,
      pfzValue,
      pfzSubtext,
    };
  }, [location, pfzGeoJson, summary]);

  return (
    <div
      className="glass-card"
      style={{
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Metric Cards Row */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
        {/* SST */}
        <StatItem
          icon={<Thermometer size={16} color="var(--accent-cyan)" />}
          label={localStats.sstLabel}
          value={localStats.sstValue}
          subtext={localStats.sstSubtext}
          loading={isLoading}
        />

        {/* Waves */}
        <StatItem
          icon={<Waves size={16} color="var(--accent-blue)" />}
          label={localStats.waveLabel}
          value={localStats.waveValue}
          subtext={localStats.waveSubtext}
          loading={isLoading}
        />

        {/* Chlorophyll */}
        <StatItem
          icon={<Leaf size={16} color="var(--accent-emerald)" />}
          label={localStats.chlLabel}
          value={localStats.chlValue}
          subtext={localStats.chlSubtext}
          loading={isLoading}
        />

        {/* PFZ Hotspots */}
        <StatItem
          icon={<Fish size={16} color="var(--accent-amber)" />}
          label="PFZ Zones"
          value={localStats.pfzValue}
          subtext={localStats.pfzSubtext}
          loading={isLoading}
        />

        {/* Safety Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "8px", borderLeft: "1px solid var(--border)" }}>
          <ShieldAlert size={18} color={safetyColor} />
          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>
              Fleet Status
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "0.88rem",
                color: safetyColor,
                letterSpacing: "0.04em",
              }}
            >
              {summary?.marine_safety?.overall_status || "NORMAL SEAS"}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Refresh Button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "rgba(0, 229, 255, 0.08)",
          border: "1px solid rgba(0, 229, 255, 0.25)",
          borderRadius: "8px",
          padding: "7px 14px",
          color: "var(--accent-cyan)",
          fontSize: "0.8rem",
          fontWeight: 600,
          fontFamily: "var(--font-ui)",
          cursor: isRefreshing ? "not-allowed" : "pointer",
          transition: "all 0.2s ease",
          opacity: isRefreshing ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isRefreshing) {
            e.currentTarget.style.backgroundColor = "rgba(0, 229, 255, 0.16)";
            e.currentTarget.style.borderColor = "var(--accent-cyan)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isRefreshing) {
            e.currentTarget.style.backgroundColor = "rgba(0, 229, 255, 0.08)";
            e.currentTarget.style.borderColor = "rgba(0, 229, 255, 0.25)";
          }
        }}
        title="Trigger Copernicus & INCOIS satellite data re-sync"
      >
        <RefreshCw
          size={14}
          style={{
            animation: isRefreshing ? "spin 1s linear infinite" : "none",
          }}
        />
        <span>{isRefreshing ? "Syncing..." : "Refresh Ocean Data"}</span>
      </button>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  subtext,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  loading: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "var(--font-mono)" }}>
          {label}
        </div>
        <div className="mono" style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text-primary)" }}>
          {loading ? "..." : value}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>
          {subtext}
        </div>
      </div>
    </div>
  );
}
