import type { NextConfig } from "next";

/**
 * next.config.ts — ORCA Unified Frontend
 *
 * Rewrites proxy both FastAPI backends through Next.js so the browser
 * never makes cross-origin requests:
 *   /api/geo/**  →  http://localhost:8000/**  (geospatial map backend)
 *   /api/orca/** →  http://localhost:8001/**  (ORCA AI advisory backend)
 */
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Geospatial backend — /maps/ocean, /maps/pfz, /maps/safety, /data/summary, etc.
        source: "/api/geo/:path*",
        destination: "http://localhost:8000/:path*",
      },
      {
        // ORCA AI advisory backend — /query, /transcribe
        source: "/api/orca/:path*",
        destination: "http://localhost:8001/:path*",
      },
    ];
  },
};

export default nextConfig;
