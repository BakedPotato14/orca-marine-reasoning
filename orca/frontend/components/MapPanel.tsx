"use client";

import React, { useState } from "react";
import { Layers, Fish, ShieldAlert, ExternalLink, RefreshCw } from "lucide-react";
import type { MapTab } from "@/lib/types";

interface MapPanelProps {
  initialTab?: MapTab;
  height?: string | number;
  className?: string;
  localPfzCount?: number;
}

export function MapPanel({
  initialTab = "ocean",
  height = "100%",
  className = "",
  localPfzCount,
}: MapPanelProps) {
  const [currentTab, setCurrentTab] = useState<MapTab>(initialTab);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Folium endpoints served via Next.js proxy
  const mapUrls: Record<MapTab, string> = {
    ocean: "/api/geo/maps/ocean",
    pfz: "/api/geo/maps/pfz",
    safety: "/api/geo/maps/safety",
  };

  const reloadIframe = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div
      className={`glass-card ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: height,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Tab bar header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "rgba(10, 12, 16, 0.75)",
          backdropFilter: "blur(8px)",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {/* Tab Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <TabButton
            active={currentTab === "ocean"}
            onClick={() => {
              setCurrentTab("ocean");
              setIsLoading(true);
            }}
            icon={<Layers size={15} />}
            label="Ocean Overview"
            accent="var(--accent-cyan)"
          />
          <TabButton
            active={currentTab === "pfz"}
            onClick={() => {
              setCurrentTab("pfz");
              setIsLoading(true);
            }}
            icon={<Fish size={15} />}
            label={localPfzCount !== undefined ? `PFZ Zones (${localPfzCount})` : "PFZ Zones"}
            accent="var(--accent-emerald)"
          />
          <TabButton
            active={currentTab === "safety"}
            onClick={() => {
              setCurrentTab("safety");
              setIsLoading(true);
            }}
            icon={<ShieldAlert size={15} />}
            label="Safety & Hazards"
            accent="var(--accent-amber)"
          />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={reloadIframe}
            title="Reload Folium Map"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "5px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
          >
            <RefreshCw size={15} />
          </button>

          <a
            href={mapUrls[currentTab]}
            target="_blank"
            rel="noopener noreferrer"
            title="Open full interactive map in new window"
            style={{
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              padding: "5px",
              borderRadius: "4px",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent-cyan)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {/* Map iframe container */}
      <div style={{ flex: 1, position: "relative", width: "100%", height: "100%", minHeight: "450px" }}>
        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(10, 12, 16, 0.8)",
              zIndex: 10,
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                border: "2px solid rgba(0, 229, 255, 0.2)",
                borderTopColor: "var(--accent-cyan)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              Loading Satellite Layers...
            </span>
          </div>
        )}

        <iframe
          key={`${currentTab}-${iframeKey}`}
          src={mapUrls[currentTab]}
          title={`Geospatial Map - ${currentTab}`}
          onLoad={() => setIsLoading(false)}
          style={{
            width: "100%",
            height: "100%",
            minHeight: "480px",
            border: "none",
            display: "block",
            backgroundColor: "#0a0c10",
          }}
          allow="geolocation"
        />
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderRadius: "6px",
        fontSize: "0.8rem",
        fontWeight: active ? 600 : 500,
        fontFamily: "var(--font-ui)",
        cursor: "pointer",
        transition: "all 0.15s ease",
        color: active ? accent : "var(--text-secondary)",
        backgroundColor: active ? `${accent}15` : "transparent",
        border: active ? `1px solid ${accent}40` : "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255, 255, 255, 0.04)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
