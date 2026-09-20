"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { GeoJSONFeatureCollection } from "@/lib/types";

// Dynamically import Leaflet map with SSR disabled to prevent window is not defined errors
const AdvisoryMapInner = dynamic(() => import("./AdvisoryMapInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "260px",
        borderRadius: "8px",
        backgroundColor: "rgba(18, 22, 32, 0.9)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          border: "2px solid rgba(0, 229, 255, 0.2)",
          borderTopColor: "var(--accent-cyan)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        Loading Advisory Chart...
      </span>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  ),
});

interface AdvisoryMapProps {
  lat: number;
  lon: number;
  geoJson?: GeoJSONFeatureCollection | null;
  height?: string | number;
}

export function AdvisoryMap({ lat, lon, geoJson, height }: AdvisoryMapProps) {
  return <AdvisoryMapInner lat={lat} lon={lon} geoJson={geoJson} height={height} />;
}
