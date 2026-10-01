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
        backgroundColor: "rgba(22, 24, 28, 0.75)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "16px 18px",
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
          <CloudSun size={17} color="var(--accent-gold)" />
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(220, 212, 198, 0.06)" />
            <XAxis
              dataKey="time"
              stroke="#706b63"
              fontSize={11}
              tickLine={false}
              fontFamily="var(--font-mono)"
            />
            {/* Left Y Axis: Wave Height (m) */}
            <YAxis
              yAxisId="left"
              stroke="#7ba0b2"
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
              stroke="#6e9c77"
              fontSize={11}
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}k`}
              tickLine={false}
              fontFamily="var(--font-mono)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(18, 19, 22, 0.96)",
                borderColor: "rgba(212, 175, 55, 0.35)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
              }}
              labelStyle={{ color: "var(--accent-gold)", fontWeight: "bold" }}
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
              fill="#6e9c77"
              opacity={0.35}
              radius={[3, 3, 0, 0]}
              barSize={16}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="wave_height_m"
              name="Wave Height (m)"
              stroke="#7ba0b2"
              strokeWidth={2.2}
              dot={{ r: 3, fill: "#7ba0b2" }}
              activeDot={{ r: 5, fill: "#d4af37" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
