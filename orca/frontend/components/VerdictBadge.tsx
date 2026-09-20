"use client";

import React from "react";
import { verdictToHex, verdictToLabel } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, AlertOctagon, HelpCircle } from "lucide-react";

interface VerdictBadgeProps {
  color: "green" | "amber" | "red" | string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export function VerdictBadge({ color, size = "md", showIcon = true }: VerdictBadgeProps) {
  const hex = verdictToHex(color);
  const label = verdictToLabel(color);

  const getIcon = () => {
    switch (color) {
      case "green":
        return <ShieldCheck size={size === "lg" ? 22 : size === "md" ? 18 : 14} />;
      case "amber":
        return <AlertTriangle size={size === "lg" ? 22 : size === "md" ? 18 : 14} />;
      case "red":
        return <AlertOctagon size={size === "lg" ? 22 : size === "md" ? 18 : 14} />;
      default:
        return <HelpCircle size={size === "lg" ? 22 : size === "md" ? 18 : 14} />;
    }
  };

  const sizeStyles = {
    sm: { padding: "4px 8px", fontSize: "0.75rem", gap: "6px" },
    md: { padding: "6px 12px", fontSize: "0.875rem", gap: "8px" },
    lg: { padding: "10px 18px", fontSize: "1.05rem", gap: "10px" },
  }[size];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "9999px",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: hex,
        backgroundColor: `${hex}18`, // ~10% opacity
        border: `1.5px solid ${hex}66`,
        boxShadow: `0 0 16px ${hex}26`,
        transition: "all 0.2s ease",
        ...sizeStyles,
      }}
    >
      {/* Animated pulsing dot */}
      <span
        style={{
          width: size === "lg" ? "9px" : "7px",
          height: size === "lg" ? "9px" : "7px",
          borderRadius: "50%",
          backgroundColor: hex,
          boxShadow: `0 0 8px ${hex}`,
          display: "inline-block",
        }}
      />
      {showIcon && getIcon()}
      <span>{label}</span>
    </div>
  );
}
