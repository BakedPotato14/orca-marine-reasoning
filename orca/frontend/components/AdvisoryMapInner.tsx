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
    width: 22px;
    height: 22px;
    background: #00e5ff;
    border: 2.5px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 14px #00e5ff, 0 0 4px #000;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0a0c10;
    font-size: 11px;
    font-weight: bold;
  ">⛵</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const destIcon = L.divIcon({
  className: "custom-dest-marker",
  html: `<div style="
    width: 22px;
    height: 22px;
    background: #00e676;
    border: 2.5px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 14px #00e676, 0 0 4px #000;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0a0c10;
    font-size: 11px;
    font-weight: bold;
  ">🎯</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
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
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <MapContainer
        center={position}
        zoom={9}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "100%", background: "#0a0c10" }}
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
            <div style={{ color: "#000", fontSize: "0.8rem", padding: "4px" }}>
              <strong>Vessel Departure</strong>
              <div>{formatCoord(lat, lon)}</div>
            </div>
          </Popup>
        </Marker>

        {/* Route line if extracted */}
        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: "#00e5ff",
              weight: 3,
              dashArray: "6, 8",
              opacity: 0.85,
            }}
          />
        )}

        {/* If route line has destination */}
        {routeCoords.length > 1 && (
          <Marker position={routeCoords[routeCoords.length - 1]} icon={destIcon}>
            <Popup>
              <div style={{ color: "#000", fontSize: "0.8rem", padding: "4px" }}>
                <strong>Advisory Destination / PFZ</strong>
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
              color: "#00e676",
              weight: 2,
              opacity: 0.7,
              fillOpacity: 0.15,
            })}
          />
        )}
      </MapContainer>
    </div>
  );
}
