/**
 * lib/utils.ts — ORCA frontend utility helpers
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui class merge helper */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Verdict color helpers
// ---------------------------------------------------------------------------

/** Maps verdict_color to the design-token CSS variable / hex in Wabi-Sabi palette */
export function verdictToHex(color: "green" | "amber" | "red" | string): string {
  switch (color) {
    case "green": return "#6e9c77"; // Lichen / tea moss green
    case "amber": return "#c88e38"; // Aged bamboo & ochre
    case "red":   return "#b85344"; // Earthen terracotta & cinnabar
    default:      return "#a8a297"; // River stone neutral
  }
}

/** Maps verdict_color to a human-readable label */
export function verdictToLabel(color: "green" | "amber" | "red" | string): string {
  switch (color) {
    case "green": return "SAFE";
    case "amber": return "CAUTION";
    case "red":   return "UNSAFE";
    default:      return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// Language name lookup
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  or: "Odia",
  bn: "Bengali",
};

/** Returns human-readable language name from ISO 639-1 code */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code?.toLowerCase()] ?? code?.toUpperCase() ?? "English";
}

// ---------------------------------------------------------------------------
// Coordinate formatting
// ---------------------------------------------------------------------------

/** Format lat/lon as a readable string e.g. "12.87°N, 74.84°E" */
export function formatCoord(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${latDir}, ${Math.abs(lon).toFixed(3)}°${lonDir}`;
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes an audio string to a valid data URI for <audio src>.
 * If the backend already returns a data URI (e.g. data:audio/mp3;base64,...),
 * it returns it as-is without double-prefixing.
 */
export function audioDataUri(base64: string): string {
  if (!base64) return "";
  if (base64.startsWith("data:audio/")) {
    return base64;
  }
  return `data:audio/mpeg;base64,${base64}`;
}

// ---------------------------------------------------------------------------
// Session thread_id management
// ---------------------------------------------------------------------------

const THREAD_ID_KEY = "orca_thread_id";

/** Get or create a persistent session UUID for multi-turn ORCA memory */
export function getOrCreateThreadId(): string {
  if (typeof window === "undefined") return "ssr_session";
  let id = localStorage.getItem(THREAD_ID_KEY);
  if (!id) {
    // crypto.randomUUID() is available in all modern browsers
    id = crypto.randomUUID();
    localStorage.setItem(THREAD_ID_KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Marine safety status helpers
// ---------------------------------------------------------------------------

/** Maps marine safety overall_status string to a hex color in Wabi-Sabi palette */
export function safetyStatusToHex(status: string): string {
  switch (status?.toUpperCase()) {
    case "NORMAL":      return "#6e9c77"; // Lichen / tea moss green
    case "CAUTION":     return "#c88e38"; // Aged bamboo & ochre
    case "ROUGH ALERT": return "#c46d3b"; // Ripe persimmon
    case "DANGER":      return "#b85344"; // Earthen terracotta
    default:            return "#a8a297"; // River stone
  }
}

/** Maps PFZ category to hex color in Wabi-Sabi palette */
export function pfzCategoryToHex(category: string): string {
  if (category?.toLowerCase().includes("high"))     return "#6e9c77"; // Lichen / moss green
  if (category?.toLowerCase().includes("moderate")) return "#c88e38"; // Bamboo / ochre
  return "#7ba0b2"; // Aizome oceanic indigo
}

// ---------------------------------------------------------------------------
// Geospatial distance & coastal sector helpers
// ---------------------------------------------------------------------------

/**
 * Computes great-circle distance between two coordinates in kilometers using Haversine formula
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface CoastalSector {
  sector: string;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
}

export const COASTAL_SECTORS: CoastalSector[] = [
  { sector: "Gujarat Coast", lat_min: 20.0, lat_max: 24.0, lon_min: 68.0, lon_max: 72.5 },
  { sector: "Maharashtra / Konkan Coast", lat_min: 16.0, lat_max: 20.0, lon_min: 71.5, lon_max: 73.5 },
  { sector: "Goa & Karnataka Coast", lat_min: 12.5, lat_max: 16.0, lon_min: 73.0, lon_max: 75.0 },
  { sector: "Kerala / Malabar Coast", lat_min: 8.0, lat_max: 12.5, lon_min: 74.5, lon_max: 77.5 },
  { sector: "Gulf of Mannar & Coromandel", lat_min: 8.0, lat_max: 13.5, lon_min: 78.0, lon_max: 81.0 },
  { sector: "Andhra Pradesh Coast", lat_min: 13.5, lat_max: 18.5, lon_min: 80.0, lon_max: 84.5 },
  { sector: "Odisha & West Bengal Coast", lat_min: 18.5, lat_max: 22.0, lon_min: 84.5, lon_max: 89.0 },
];

/**
 * Finds matching coastal sector name for a coordinate, or null if outside primary coastal boxes
 */
export function findMatchingSector(lat: number, lon: number): string | null {
  for (const s of COASTAL_SECTORS) {
    if (lat >= s.lat_min && lat <= s.lat_max && lon >= s.lon_min && lon <= s.lon_max) {
      return s.sector;
    }
  }
  return null;
}
