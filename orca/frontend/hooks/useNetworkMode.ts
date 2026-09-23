"use client";

import { useState, useEffect, useCallback } from "react";

export type BandwidthMode = "full" | "lite";

export interface NetworkStatus {
  mode: BandwidthMode;
  effectiveType: string;
  isOnline: boolean;
  saveData: boolean;
  isAutoDetectedLowBandwidth: boolean;
  toggleMode: () => void;
  setMode: (mode: BandwidthMode) => void;
}

export function useNetworkMode(): NetworkStatus {
  const [mode, setMode] = useState<BandwidthMode>("full");
  const [effectiveType, setEffectiveType] = useState<string>("4g");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [saveData, setSaveData] = useState<boolean>(false);
  const [isAutoDetectedLowBandwidth, setIsAutoDetectedLowBandwidth] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateConnectionStatus = () => {
      const conn =
        (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } }).connection;

      const online = navigator.onLine !== false;
      setIsOnline(online);

      if (conn) {
        const type = conn.effectiveType || "4g";
        const isDataSaver = Boolean(conn.saveData);
        setEffectiveType(type);
        setSaveData(isDataSaver);

        const isSlow = type === "2g" || type === "slow-2g" || isDataSaver || !online;
        setIsAutoDetectedLowBandwidth(isSlow);

        // Auto-switch to lite mode on slow cellular networks or offline
        if (isSlow) {
          setMode("lite");
        }
      }
    };

    updateConnectionStatus();

    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);

    const conn = (navigator as unknown as { connection?: { addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } }).connection;
    if (conn && conn.addEventListener) {
      conn.addEventListener("change", updateConnectionStatus);
    }

    return () => {
      window.removeEventListener("online", updateConnectionStatus);
      window.removeEventListener("offline", updateConnectionStatus);
      if (conn && conn.removeEventListener) {
        conn.removeEventListener("change", updateConnectionStatus);
      }
    };
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "full" ? "lite" : "full"));
  }, []);

  return {
    mode,
    effectiveType,
    isOnline,
    saveData,
    isAutoDetectedLowBandwidth,
    toggleMode,
    setMode,
  };
}
