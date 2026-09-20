"use client";

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { ForecastPoint } from "@/lib/types";
import { CloudSun } from "lucide-react";

interface ForecastChartProps {
  series: ForecastPoint[] | null | undefined;
}

export function ForecastChart({ series }: ForecastChartProps) {
  if (!series || series.length === 0) return null;

  return (
    <div
      style={{
        marginTop: "16px",
        backgroundColor: "rgba(18, 22, 32, 0.7)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CloudSun size={17} color="var(--accent-cyan)" />
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
            }}
          >
            12-Hour Sea State & Wind Forecast
          </span>
        </div>
        <span
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Open-Meteo Marine Horizon
        </span>
      </div>

      <div style={{ width: "100%", height: "200px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={series}
            margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
            <XAxis
              dataKey="time"
              stroke="#546e7a"
              fontSize={11}
              tickLine={false}
              fontFamily="var(--font-mono)"
            />
            {/* Left Y Axis: Wave Height (m) */}
            <YAxis
              yAxisId="left"
              stroke="#00e5ff"
              fontSize={11}
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}m`}
              tickLine={false}
              fontFamily="var(--font-mono)"
            />
            {/* Right Y Axis: Wind Speed (km/h) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#00e676"
              fontSize={11}
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}k`}
              tickLine={false}
              fontFamily="var(--font-mono)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(10, 12, 16, 0.95)",
                borderColor: "rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
              }}
              labelStyle={{ color: "var(--accent-cyan)", fontWeight: "bold" }}
              itemStyle={{ padding: "2px 0" }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                paddingTop: "6px",
              }}
            />
            <Bar
              yAxisId="right"
              dataKey="wind_speed_kmh"
              name="Wind Speed (km/h)"
              fill="#00e676"
              opacity={0.35}
              radius={[3, 3, 0, 0]}
              barSize={16}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="wave_height_m"
              name="Wave Height (m)"
              stroke="#00e5ff"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#00e5ff" }}
              activeDot={{ r: 5, fill: "#ffffff" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
