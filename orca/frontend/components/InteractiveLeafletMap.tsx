"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  CircleMarker,
  Polyline,
  Rectangle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJSONFeatureCollection } from "@/lib/types";
import { formatCoord, haversineDistanceKm } from "@/lib/utils";

export type TileStyle = "dark" | "light" | "osm" | "satellite";

export interface MapOverlaySettings {
  showSST: boolean;
  showChl: boolean;
  showWaves: boolean;
  showPFZ: boolean;
  showSafety: boolean;
  showIMBL: boolean;
}

export interface SafetySectorData {
  sector: string;
  max_wave_height_m: number;
  mean_wave_height_m: number;
  severity: string;
  color: string;
  advisory: string;
  center_lat: number;
  center_lon: number;
  bounds?: [[number, number], [number, number]];
  timestamp?: string;
}

export interface PortInfo {
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export const MAJOR_INDIAN_PORTS: PortInfo[] = [
  { name: "Veraval Harbour", state: "Gujarat", lat: 20.90, lon: 70.37 },
  { name: "Porbandar", state: "Gujarat", lat: 21.64, lon: 69.60 },
  { name: "Mumbai (Sassoon Dock)", state: "Maharashtra", lat: 18.91, lon: 72.82 },
  { name: "Ratnagiri", state: "Maharashtra", lat: 16.98, lon: 73.30 },
  { name: "Mormugao", state: "Goa", lat: 15.42, lon: 73.80 },
  { name: "Mangalore (Old Port)", state: "Karnataka", lat: 12.86, lon: 74.84 },
  { name: "Kochi (Thoppumpady)", state: "Kerala", lat: 9.94, lon: 76.26 },
  { name: "Kollam (Neendakara)", state: "Kerala", lat: 8.94, lon: 76.53 },
  { name: "Vizhinjam", state: "Kerala", lat: 8.38, lon: 76.99 },
  { name: "Tuticorin", state: "Tamil Nadu", lat: 8.76, lon: 78.13 },
  { name: "Chennai (Kasimedu)", state: "Tamil Nadu", lat: 13.12, lon: 80.30 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.70, lon: 83.30 },
  { name: "Kakinada", state: "Andhra Pradesh", lat: 16.98, lon: 82.25 },
  { name: "Paradip", state: "Odisha", lat: 20.32, lon: 86.61 },
];

interface InteractiveLeafletMapProps {
  lat: number;
  lon: number;
  tileStyle: TileStyle;
  overlays: MapOverlaySettings;
  pfzGeoJson?: GeoJSONFeatureCollection | null;
  safetySectors?: SafetySectorData[] | null;
  advisoryGeoJson?: GeoJSONFeatureCollection | null;
  selectedHotspotCoords?: { lat: number; lon: number } | null;
  onSelectHotspot?: (coords: { lat: number; lon: number; id: string }) => void;
  onSetLocation?: (coords: { lat: number; lon: number }) => void;
  height?: string;
}

const TILE_URLS: Record<TileStyle, { url: string; attribution: string; darkFilter?: boolean }> = {
  dark: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Nautical Dark',
    darkFilter: true,
  },
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> Satellite',
  },
};

// Custom Vessel & Departure Marker
const createVesselIcon = () =>
  L.divIcon({
    className: "custom-vessel-marker",
    html: `<div style="
      width: 32px;
      height: 32px;
      background: #0B1120;
      border: 2.5px solid #22D3EE;
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(34, 211, 238, 0.6), 0 4px 10px rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #22D3EE;
      font-size: 16px;
    ">⛵</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

// Custom Port Marker
const createPortIcon = (name: string) =>
  L.divIcon({
    className: "custom-port-marker",
    html: `<div style="
      background: #0B132B;
      color: #38BDF8;
      border: 1.5px solid #0EA5E9;
      border-radius: 6px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 700;
      font-family: sans-serif;
      box-shadow: 0 0 10px rgba(14, 165, 233, 0.4), 0 2px 5px rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
      cursor: pointer;
    ">
      <span>⚓</span>
      <span style="color: #F1F5F9;">${name}</span>
    </div>`,
    iconSize: [115, 22],
    iconAnchor: [57, 11],
  });

// Custom Numbered PFZ Badge Marker in Teal/Cyan
const createPFZIcon = (idNum: string, category: string) => {
  const isHigh = category === "High Probability";
  const bg = isHigh ? "#34D399" : "#22D3EE";
  return L.divIcon({
    className: "custom-pfz-marker",
    html: `<div style="
      background: ${bg};
      color: #0B1120;
      font-family: monospace;
      font-weight: 800;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 9999px;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 0 12px ${bg}88, 0 2px 6px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
      cursor: pointer;
    ">
      <span>🐟</span>
      <span>${idNum}</span>
    </div>`,
    iconSize: [44, 22],
    iconAnchor: [22, 11],
  });
};

// Stable Controller to smoothly animate map to new location WITHOUT continuous jerking
function MapFlyTo({
  coords,
  zoom = 9,
}: {
  coords: { lat: number; lon: number } | null | undefined;
  zoom?: number;
}) {
  const map = useMap();
  const lastCoordsRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!coords || isNaN(coords.lat) || isNaN(coords.lon)) return;
    if (
      lastCoordsRef.current &&
      Math.abs(lastCoordsRef.current.lat - coords.lat) < 0.0001 &&
      Math.abs(lastCoordsRef.current.lon - coords.lon) < 0.0001
    ) {
      return;
    }
    lastCoordsRef.current = { lat: coords.lat, lon: coords.lon };
    map.flyTo([coords.lat, coords.lon], zoom, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [coords?.lat, coords?.lon, zoom, map]);

  return null;
}

// Approximate Representative Indian Maritime Boundary Line Coordinates (IMBL)
const FALLBACK_IMBL_POINTS: [number, number][] = [
  [23.5, 68.0],
  [22.2, 67.5],
  [20.5, 69.0],
  [19.0, 71.0],
  [17.0, 72.0],
  [15.0, 73.0],
  [12.87, 74.0],
  [10.0, 75.0],
  [8.0, 76.5],
  [7.0, 77.5],
  [8.5, 79.5],
  [10.2, 80.5],
  [13.0, 81.5],
  [16.0, 83.5],
  [18.5, 86.0],
  [20.5, 88.0],
  [21.5, 89.2],
];

interface MappedPFZPoint {
  id: string;
  lat: number;
  lon: number;
  category: string;
  sst?: number;
  chl?: number;
  species: string;
  port: string;
  distance?: number;
}

export default function InteractiveLeafletMap({
  lat,
  lon,
  tileStyle,
  overlays,
  pfzGeoJson,
  safetySectors,
  advisoryGeoJson,
  selectedHotspotCoords,
  onSelectHotspot,
  onSetLocation,
  height = "600px",
}: InteractiveLeafletMapProps) {
  const currentPos: [number, number] = [lat || 12.87, lon || 74.84];
  const activeTile = TILE_URLS[tileStyle] || TILE_URLS.dark;
  const [imblLines, setImblLines] = useState<[number, number][][]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore cleanup errors on fast unmount
        }
        mapRef.current = null;
      }
    };
  }, []);

  // Fetch true high-resolution IMBL boundary line GeoJSON from backend
  useEffect(() => {
    fetch("/api/geo/data/imbl-geojson")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.features?.[0]?.geometry) {
          const geom = data.features[0].geometry;
          const lines: [number, number][][] = [];
          if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            geom.coordinates.forEach((part: any[]) => {
              const pts: [number, number][] = part.map(([gLon, gLat]) => [gLat, gLon]);
              if (pts.length > 1) lines.push(pts);
            });
          } else if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pts: [number, number][] = geom.coordinates.map(([gLon, gLat]: [number, number]) => [gLat, gLon]);
            if (pts.length > 1) lines.push(pts);
          }
          if (lines.length > 0) setImblLines(lines);
        }
      })
      .catch(() => {});
  }, []);

  // Nearest port calculation for inland awareness
  const nearestPort = useMemo(() => {
    let closest = MAJOR_INDIAN_PORTS[0];
    let minD = Infinity;
    for (const p of MAJOR_INDIAN_PORTS) {
      const d = haversineDistanceKm(lat, lon, p.lat, p.lon);
      if (d < minD) {
        minD = d;
        closest = p;
      }
    }
    return { ...closest, distanceKm: Math.round(minD) };
  }, [lat, lon]);

  const isInland = nearestPort.distanceKm > 45;

  // Extract route lines if advisory geoJson contains them
  const advisoryRoute = useMemo(() => {
    if (!advisoryGeoJson?.features) return [];
    const pts: [number, number][] = [];
    for (const f of advisoryGeoJson.features) {
      if (f.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f.geometry.coordinates as any[]).forEach(([ln, lt]) => {
          if (typeof lt === "number" && typeof ln === "number") {
            pts.push([lt, ln]);
          }
        });
      }
    }
    return pts;
  }, [advisoryGeoJson]);

  // Extract PFZ features
  const pfzPoints: MappedPFZPoint[] = useMemo(() => {
    if (!pfzGeoJson?.features) return [];
    return pfzGeoJson.features
      .filter((f) => f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates))
      .map((f) => {
        const coords = f.geometry.coordinates as number[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = (f.properties || {}) as Record<string, any>;
        return {
          id: String(props.hotspot_id || props.id || "PFZ"),
          lat: coords[1],
          lon: coords[0],
          category: String(props.category || "Moderate Probability"),
          sst: typeof props.sst_celsius === "number" ? props.sst_celsius : undefined,
          chl: typeof props.chl_mg_m3 === "number" ? props.chl_mg_m3 : undefined,
          species: String(props.target_species || "Pelagic Fish"),
          port: String(props.nearest_port || "Coastal"),
          distance: typeof props.distance_km === "number" ? props.distance_km : undefined,
        };
      });
  }, [pfzGeoJson]);

  const activeFlyCoords = useMemo(() => {
    return selectedHotspotCoords || { lat, lon };
  }, [selectedHotspotCoords, lat, lon]);

  if (!isMounted) {
    return (
      <div style={{ width: "100%", height: height || "600px", minHeight: "450px", background: "#0B1120" }} className="flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      {/* Inland notice banner if user anchor is located inland */}
      {isInland && (
        <div className="absolute top-2.5 left-12 right-12 sm:left-auto sm:right-3 bg-ocean-900/95 border border-amber-500/50 backdrop-blur-md rounded-xl p-2 px-3 z-[1000] text-xs shadow-xl flex items-center justify-between gap-3 max-w-md">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-sm">📍</span>
            <div className="text-[11px] leading-tight text-slate-200">
              <strong className="text-amber-300">Anchor is inland</strong> ({nearestPort.distanceKm} km from sea).
              <div className="text-slate-400 mt-0.5">Linked to {nearestPort.name} operational coastal base.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onSetLocation) {
                onSetLocation({ lat: nearestPort.lat, lon: nearestPort.lon });
              } else if (onSelectHotspot) {
                onSelectHotspot({ lat: nearestPort.lat, lon: nearestPort.lon, id: nearestPort.name });
              }
            }}
            className="px-2 py-1 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 text-[10px] font-bold rounded-lg border border-amber-400/40 transition whitespace-nowrap"
          >
            Snap to Coast ⚓
          </button>
        </div>
      )}

      <MapContainer
        ref={mapRef}
        center={currentPos}
        zoom={isInland ? 7 : 8}
        scrollWheelZoom={true}
        style={{ width: "100%", height: "100%", background: "#0B1120" }}
      >
        <TileLayer
          key={tileStyle}
          attribution={activeTile.attribution}
          url={activeTile.url}
          className={tileStyle === "dark" ? "leaflet-dark-tiles" : ""}
        />

        {/* Dynamic Map FlyTo when user clicks anchor or hotspot */}
        <MapFlyTo
          coords={activeFlyCoords}
          zoom={selectedHotspotCoords ? 10 : isInland ? 7 : 8}
        />

        {/* 1. Departure Vessel Marker */}
        <Marker position={currentPos} icon={createVesselIcon()}>
          <Popup>
            <div className="p-2 text-xs font-sans text-slate-900">
              <strong className="text-cyan-700 text-sm block mb-1">⛵ Departure Anchor</strong>
              <div className="font-mono text-[11px] font-semibold">{formatCoord(lat, lon)}</div>
              <div className="text-slate-600 mt-1">
                {isInland
                  ? `Inland base • ${nearestPort.distanceKm} km from ${nearestPort.name}`
                  : "Active coastal departure origin point"}
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Inland vector line from inland anchor to nearest coastal port */}
        {isInland && (
          <Polyline
            positions={[currentPos, [nearestPort.lat, nearestPort.lon]]}
            pathOptions={{
              color: "#22D3EE",
              weight: 2,
              dashArray: "4, 6",
              opacity: 0.8,
            }}
          />
        )}

        {/* Range Circles around vessel (50km & 100km) */}
        <Circle
          center={currentPos}
          radius={50000}
          pathOptions={{
            color: "#22D3EE",
            weight: 1,
            dashArray: "4, 6",
            fillOpacity: 0.02,
          }}
        />
        <Circle
          center={currentPos}
          radius={100000}
          pathOptions={{
            color: "#22D3EE",
            weight: 1,
            dashArray: "2, 8",
            fillOpacity: 0.01,
          }}
        />

        {/* 2. Advisory Route LineString (if synthesized by ORCA LLM) */}
        {advisoryRoute.length > 1 && (
          <Polyline
            positions={advisoryRoute}
            pathOptions={{
              color: "#FBBF24",
              weight: 3.5,
              dashArray: "6, 8",
              opacity: 0.95,
            }}
          />
        )}

        {/* 3. IMBL Geofence Boundary Line (Dashed) */}
        {overlays.showIMBL && (
          <>
            {imblLines.length > 0 ? (
              imblLines.map((lineCoords, lIdx) => (
                <Polyline
                  key={`imbl-${lIdx}`}
                  positions={lineCoords}
                  pathOptions={{
                    color: "#F87171",
                    weight: 2.5,
                    dashArray: "8, 8",
                    opacity: 0.85,
                  }}
                >
                  <Popup>
                    <div className="p-2 text-xs text-slate-900">
                      <strong className="text-red-600 block mb-1">⚠️ IMBL / EEZ Maritime Perimeter</strong>
                      <p className="text-slate-700">
                        International boundary geofence. Mechanised vessels must maintain &gt; 5 NM safe clearance.
                      </p>
                    </div>
                  </Popup>
                </Polyline>
              ))
            ) : (
              <Polyline
                positions={FALLBACK_IMBL_POINTS}
                pathOptions={{
                  color: "#F87171",
                  weight: 2.5,
                  dashArray: "8, 8",
                  opacity: 0.85,
                }}
              >
                <Popup>
                  <div className="p-2 text-xs text-slate-900">
                    <strong className="text-red-600 block mb-1">⚠️ IMBL / EEZ Maritime Perimeter</strong>
                    <p className="text-slate-700">
                      International boundary geofence. Mechanised vessels must maintain &gt; 5 NM safe clearance.
                    </p>
                  </div>
                </Popup>
              </Polyline>
            )}
          </>
        )}

        {/* 4. Major Indian Fishing Harbours and Operational Bases */}
        {MAJOR_INDIAN_PORTS.map((port, pIdx) => (
          <Marker
            key={`port-${pIdx}`}
            position={[port.lat, port.lon]}
            icon={createPortIcon(port.name)}
            eventHandlers={{
              click: () => {
                if (onSetLocation) {
                  onSetLocation({ lat: port.lat, lon: port.lon });
                } else if (onSelectHotspot) {
                  onSelectHotspot({ lat: port.lat, lon: port.lon, id: port.name });
                }
              },
            }}
          >
            <Popup>
              <div className="p-2 text-xs text-slate-900 min-w-[190px]">
                <strong className="text-sky-700 text-sm block mb-1">⚓ {port.name}</strong>
                <div className="text-slate-600 text-[11px] mb-1">{port.state}, Coastal India</div>
                <div className="font-mono text-[10px] text-slate-500 mb-2">{formatCoord(port.lat, port.lon)}</div>
                <div className="text-[11px] text-emerald-700 font-semibold mb-2">Operational Fishing Harbour</div>
                {onSetLocation && (
                  <button
                    type="button"
                    onClick={() => onSetLocation({ lat: port.lat, lon: port.lon })}
                    className="w-full px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-[11px] font-bold"
                  >
                    Set as Departure Origin
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 5. SST Gradient Circles Overlay */}
        {overlays.showSST &&
          pfzPoints.map((pt, idx) => {
            const temp = pt.sst ?? 28.5;
            const color = temp >= 30 ? "#F87171" : temp >= 28.5 ? "#FBBF24" : "#22D3EE";
            return (
              <Circle
                key={`sst-${idx}`}
                center={[pt.lat, pt.lon]}
                radius={24000}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.18,
                  weight: 1.2,
                }}
              >
                <Popup>
                  <div className="p-1.5 text-xs text-slate-900">
                    <strong className="block text-slate-800">🌡️ Sea Surface Temp (SST)</strong>
                    <div className="font-mono text-cyan-700 font-bold text-sm my-0.5">{temp.toFixed(1)}°C</div>
                    <div className="text-slate-500 text-[11px]">{formatCoord(pt.lat, pt.lon)}</div>
                  </div>
                </Popup>
              </Circle>
            );
          })}

        {/* 6. Chlorophyll-a Overlay (Nutrient Bloom Hotspots) */}
        {overlays.showChl &&
          pfzPoints
            .filter((p) => (p.chl ?? 0) >= 0.3)
            .map((pt, idx) => (
              <CircleMarker
                key={`chl-${idx}`}
                center={[pt.lat, pt.lon]}
                radius={18}
                pathOptions={{
                  color: "#34D399",
                  fillColor: "#10B981",
                  fillOpacity: 0.25,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="p-1.5 text-xs text-slate-900">
                    <strong className="block text-emerald-700">🌿 Chlorophyll-a Nutrient Front</strong>
                    <div className="font-mono font-bold text-sm text-emerald-800 my-0.5">
                      {pt.chl ? `${pt.chl.toFixed(2)} mg/m³` : "Active Upwelling"}
                    </div>
                    <div className="text-slate-500 text-[11px]">Primary forage feeding ground</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

        {/* 7. Significant Wave Height & Safety Hazard Sectors */}
        {(overlays.showWaves || overlays.showSafety) &&
          safetySectors &&
          safetySectors.map((sec, idx) => {
            const isDanger = sec.severity === "DANGER" || sec.severity === "ROUGH ALERT";
            const secColor = isDanger ? "#F87171" : (sec.color || "#38BDF8");

            return (
              <React.Fragment key={`sec-${idx}`}>
                {/* Sector Bounding Box Rectangle if available */}
                {sec.bounds && (
                  <Rectangle
                    bounds={sec.bounds}
                    pathOptions={{
                      color: secColor,
                      fillColor: secColor,
                      fillOpacity: 0.05,
                      weight: 1.2,
                      dashArray: "4, 6",
                    }}
                  />
                )}

                {/* Sector wave height center badge */}
                <Marker
                  position={[sec.center_lat, sec.center_lon]}
                  icon={L.divIcon({
                    className: "custom-wave-sector-badge",
                    html: `<div style="
                      background: #0B1120;
                      color: ${secColor};
                      border: 1.5px solid ${secColor};
                      border-radius: 8px;
                      padding: 2px 7px;
                      font-size: 11px;
                      font-weight: 700;
                      font-family: monospace;
                      box-shadow: 0 0 10px ${secColor}66, 0 2px 6px rgba(0,0,0,0.8);
                      display: flex;
                      align-items: center;
                      gap: 4px;
                      white-space: nowrap;
                      cursor: pointer;
                    ">
                      <span>🌊</span>
                      <span>${sec.max_wave_height_m}m</span>
                      <span style="font-size: 9px; opacity: 0.85; padding: 1px 4px; border-radius: 3px; background: ${secColor}22;">
                        ${sec.severity}
                      </span>
                    </div>`,
                    iconSize: [115, 24],
                    iconAnchor: [57, 12],
                  })}
                >
                  <Popup>
                    <div className="p-2 text-xs text-slate-900 max-w-[240px]">
                      <div className="font-bold text-sm text-slate-900">{sec.sector}</div>
                      <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-1 mb-1 text-white bg-slate-800">
                        {sec.severity}
                      </div>
                      <div className="font-mono text-cyan-800 font-semibold mb-1">
                        Max Wave: {sec.max_wave_height_m} m (Mean: {sec.mean_wave_height_m} m)
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{sec.advisory}</p>
                    </div>
                  </Popup>
                </Marker>

                {/* Sector broad wave envelope circle */}
                <Circle
                  center={[sec.center_lat, sec.center_lon]}
                  radius={65000}
                  pathOptions={{
                    color: secColor,
                    fillColor: secColor,
                    fillOpacity: 0.08,
                    weight: 1,
                    dashArray: "3, 6",
                  }}
                />
              </React.Fragment>
            );
          })}

        {/* 8. PFZ Hotspot Cluster Markers (Numbered badges in teal/cyan) */}
        {overlays.showPFZ &&
          pfzPoints.map((pt, idx) => (
            <Marker
              key={`pfz-${pt.id}-${idx}`}
              position={[pt.lat, pt.lon]}
              icon={createPFZIcon(pt.id, pt.category)}
              eventHandlers={{
                click: () => {
                  if (onSelectHotspot) {
                    onSelectHotspot({ lat: pt.lat, lon: pt.lon, id: pt.id });
                  }
                },
              }}
            >
              <Popup>
                <div className="p-2 text-xs text-slate-900 min-w-[200px]">
                  <div className="flex items-center justify-between border-b pb-1 mb-1.5">
                    <span className="font-mono font-bold text-sm text-cyan-700">{pt.id}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {pt.category}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-700">
                    <div>
                      <strong>Target Species:</strong> {pt.species}
                    </div>
                    <div>
                      <strong>Nearest Port:</strong> {pt.port}
                    </div>
                    {pt.distance != null && !isNaN(pt.distance) && (
                      <div>
                        <strong>Distance:</strong> {pt.distance.toFixed(0)} km
                      </div>
                    )}
                    {pt.sst != null && !isNaN(pt.sst) && (
                      <div>
                        <strong>SST:</strong> {pt.sst.toFixed(1)}°C
                      </div>
                    )}
                    {pt.chl != null && !isNaN(pt.chl) && (
                      <div>
                        <strong>Chl-a:</strong> {pt.chl.toFixed(2)} mg/m³
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
