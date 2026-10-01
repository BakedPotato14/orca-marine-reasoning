"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJSONFeatureCollection } from "@/lib/types";
import { formatCoord } from "@/lib/utils";

interface AdvisoryMapInnerProps {
  lat: number;
  lon: number;
  geoJson?: GeoJSONFeatureCollection | null;
  height?: string | number;
}

// Custom Leaflet DivIcons to avoid asset URL resolution bugs in Next.js
const vesselIcon = L.divIcon({
  className: "custom-vessel-marker",
  html: `<div style="
    width: 24px;
    height: 24px;
    background: #d4af37;
    border: 2px solid #ede8df;
    border-radius: 50%;
    box-shadow: 0 0 14px rgba(212, 175, 55, 0.4), 0 2px 6px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #121316;
    font-size: 12px;
    font-weight: bold;
  ">⛵</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const destIcon = L.divIcon({
  className: "custom-dest-marker",
  html: `<div style="
    width: 24px;
    height: 24px;
    background: #6e9c77;
    border: 2px solid #ede8df;
    border-radius: 50%;
    box-shadow: 0 0 14px rgba(110, 156, 119, 0.4), 0 2px 6px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #121316;
    font-size: 12px;
    font-weight: bold;
  ">🎯</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Helper component that flies the map to active coordinates
function FlyToController({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
      map.flyTo([lat, lon], 9, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [lat, lon, map]);
  return null;
}

export default function AdvisoryMapInner({
  lat,
  lon,
  geoJson,
  height = "260px",
}: AdvisoryMapInnerProps) {
  const position: [number, number] = [lat || 12.87, lon || 74.84];

  // Optional: Extract line coordinates if geoJson has route LineString
  const routeCoords: [number, number][] = [];
  if (geoJson && geoJson.features) {
    for (const feature of geoJson.features) {
      if (feature.geometry && feature.geometry.type === "LineString") {
        const coords = feature.geometry.coordinates as number[][];
        coords.forEach(([lng, lt]) => {
          routeCoords.push([lt, lng]);
        });
      }
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: height,
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <MapContainer
        center={position}
        zoom={9}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "100%", background: "#121316" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="leaflet-dark-tiles"
        />

        <FlyToController lat={lat} lon={lon} />

        {/* Departure Vessel Marker */}
        <Marker position={position} icon={vesselIcon}>
          <Popup>
            <div style={{ color: "#121316", fontSize: "0.8rem", padding: "4px", fontFamily: "var(--font-ui)" }}>
              <strong style={{ color: "#222" }}>Vessel Departure</strong>
              <div>{formatCoord(lat, lon)}</div>
            </div>
          </Popup>
        </Marker>

        {/* Route line if extracted */}
        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: "#d4af37",
              weight: 2.5,
              dashArray: "5, 7",
              opacity: 0.9,
            }}
          />
        )}

        {/* If route line has destination */}
        {routeCoords.length > 1 && (
          <Marker position={routeCoords[routeCoords.length - 1]} icon={destIcon}>
            <Popup>
              <div style={{ color: "#121316", fontSize: "0.8rem", padding: "4px", fontFamily: "var(--font-ui)" }}>
                <strong style={{ color: "#222" }}>Advisory Destination / PFZ</strong>
                <div>{formatCoord(routeCoords[routeCoords.length - 1][0], routeCoords[routeCoords.length - 1][1])}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Arbitrary GeoJSON overlay if features provided */}
        {geoJson && geoJson.features && geoJson.features.length > 0 && (
          <GeoJSON
            key={JSON.stringify(geoJson)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={geoJson as any}
            style={() => ({
              color: "#6e9c77",
              weight: 2,
              opacity: 0.75,
              fillOpacity: 0.16,
            })}
          />
        )}
      </MapContainer>
    </div>
  );
}
