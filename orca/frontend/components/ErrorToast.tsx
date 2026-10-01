"use client";

import React from "react";
import { AlertCircle, X } from "lucide-react";

interface ErrorToastProps {
  errors: string[];
  onDismiss?: (index: number) => void;
}

export function ErrorToast({ errors, onDismiss }: ErrorToastProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginTop: "10px",
      }}
    >
      {errors.map((err, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "rgba(184, 83, 68, 0.14)",
            border: "1px solid rgba(184, 83, 68, 0.35)",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#e8988e",
            fontSize: "0.8rem",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={15} color="var(--accent-red)" style={{ flexShrink: 0 }} />
            <span>{err}</span>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(idx)}
              style={{
                background: "transparent",
                border: "none",
                color: "#e8988e",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
