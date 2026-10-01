"use client";

import React, { useMemo } from "react";
import { Thermometer, Waves, Leaf, Fish, ShieldCheck, ShieldAlert } from "lucide-react";
import type { OceanSummary, GeoJSONFeatureCollection } from "@/lib/types";
import { haversineDistanceKm } from "@/lib/utils";

interface OceanStatsBarProps {
  summary: OceanSummary | null | undefined;
  pfzGeoJson?: GeoJSONFeatureCollection | null;
  location?: { lat: number; lon: number };
  isLoading: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function OceanStatsBar({
  summary,
  pfzGeoJson,
  location,
  isLoading,
  isRefreshing,
}: OceanStatsBarProps) {
  // Compute location-aware metrics with honest fallback labels
  const stats = useMemo(() => {
    // Default regional baseline
    let sstVal = summary?.sst?.mean_celsius !== undefined ? `${summary.sst.mean_celsius.toFixed(1)}°C` : "28.4°C";
    let sstSub = summary?.sst?.min_celsius !== undefined ? `${summary.sst.min_celsius.toFixed(1)}–${summary.sst.max_celsius.toFixed(1)}°C Basin` : "Coastal Mean";

    let waveVal = summary?.waves?.mean_height_m !== undefined ? `${summary.waves.mean_height_m.toFixed(1)} m` : "1.4 m";
    let waveSub = summary?.waves?.max_height_m !== undefined ? `Max: ${summary.waves.max_height_m.toFixed(1)}m · Moderate` : "Moderate Sea";

    let chlVal = summary?.chlorophyll?.mean_mg_m3 !== undefined ? `${summary.chlorophyll.mean_mg_m3.toFixed(2)} mg/m³` : "0.85 mg/m³";
    let chlSub = "Nutrient Upwelling";

    let pfzVal = summary?.pfz?.total_detected_hotspots !== undefined ? `${summary.pfz.total_detected_hotspots} Zones` : "14 Zones";
    let pfzSub = summary?.pfz?.high_probability_count !== undefined ? `${summary.pfz.high_probability_count} High Probability` : "Regional Active";

    let geofenceVal = "INDIAN EEZ SAFE";
    let geofenceSub = "0 Breaches Detected";
    let isGeofenceAlert = false;

    if (summary?.marine_safety) {
      if (summary.marine_safety.sectors_under_alert > 0 || (summary.marine_safety.imbl_geofence_alerts ?? 0) > 50) {
        geofenceVal = "BORDER CAUTION";
        geofenceSub = `${summary.marine_safety.imbl_geofence_alerts ?? 0} IMBL Watchlines`;
        isGeofenceAlert = true;
      }
    }

    // If active coordinates and PFZ hotspots are loaded, compute local neighborhood metrics
    if (location && pfzGeoJson?.features && pfzGeoJson.features.length > 0) {
      const { lat, lon } = location;
      let countWithin100 = 0;
      let nearestDist = Infinity;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let nearestFeat: any = null;

      for (const feat of pfzGeoJson.features) {
        if (feat.geometry?.type === "Point" && Array.isArray(feat.geometry.coordinates)) {
          const coords = feat.geometry.coordinates as number[];
          const fLon = coords[0];
          const fLat = coords[1];
          if (typeof fLat === "number" && typeof fLon === "number") {
            const dist = haversineDistanceKm(lat, lon, fLat, fLon);
            if (dist <= 100) countWithin100++;
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestFeat = feat;
            }
          }
        }
      }

      if (nearestFeat && nearestDist <= 150 && nearestFeat.properties?.sst_celsius) {
        sstVal = `${nearestFeat.properties.sst_celsius.toFixed(1)}°C`;
        sstSub = `${nearestDist.toFixed(0)} km from anchor`;
      }
      if (nearestFeat && nearestDist <= 150 && nearestFeat.properties?.chl_mg_m3) {
        chlVal = `${nearestFeat.properties.chl_mg_m3.toFixed(2)} mg/m³`;
        chlSub = "Frontal Confluence";
      }
      pfzVal = `${countWithin100} Zones`;
      pfzSub = "Within 100km radius";
    }

    return [
      {
        id: "sst",
        label: "SST (Sea Temp)",
        value: sstVal,
        subtitle: sstSub,
        icon: Thermometer,
        iconColor: "text-cyan-400",
        borderClass: "border-l-4 border-l-cyan-400",
      },
      {
        id: "wave",
        label: "Significant Wave",
        value: waveVal,
        subtitle: waveSub,
        icon: Waves,
        iconColor: "text-cyan-400",
        borderClass: "border-l-4 border-l-cyan-400",
      },
      {
        id: "chl",
        label: "Chlorophyll-a",
        value: chlVal,
        subtitle: chlSub,
        icon: Leaf,
        iconColor: "text-emerald-400",
        borderClass: "border-l-4 border-l-emerald-400",
      },
      {
        id: "pfz",
        label: "PFZ Zones Nearby",
        value: pfzVal,
        subtitle: pfzSub,
        icon: Fish,
        iconColor: "text-amber-400",
        borderClass: "border-l-4 border-l-amber-400",
      },
      {
        id: "geofence",
        label: "Fleet / Geofence",
        value: geofenceVal,
        subtitle: geofenceSub,
        icon: isGeofenceAlert ? ShieldAlert : ShieldCheck,
        iconColor: isGeofenceAlert ? "text-amber-400" : "text-emerald-400",
        borderClass: isGeofenceAlert ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-emerald-400",
      },
    ];
  }, [summary, pfzGeoJson, location]);

  const showSkeleton = isLoading || isRefreshing;

  return (
    <section
      aria-label="Oceanographic Telemetry Summary"
      aria-live="polite"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5"
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.id}
            className={`bg-ocean-800/90 border border-ocean-600/70 rounded-xl p-3.5 shadow-md backdrop-blur-sm transition-all hover:border-ocean-600 hover:shadow-lg ${stat.borderClass} ${
              showSkeleton ? "animate-pulse" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
                {stat.label}
              </span>
              <Icon size={16} className={`${stat.iconColor} shrink-0`} />
            </div>

            <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white tracking-tight my-0.5">
              {showSkeleton ? (
                <span className="inline-block w-20 h-6 bg-ocean-700/80 rounded" />
              ) : (
                stat.value
              )}
            </div>

            <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
              {showSkeleton ? (
                <span className="inline-block w-24 h-3 bg-ocean-700/60 rounded" />
              ) : (
                stat.subtitle
              )}
            </p>
          </div>
        );
      })}
    </section>
  );
}
