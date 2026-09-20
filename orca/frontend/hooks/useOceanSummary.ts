"use client";

import useSWR from "swr";
import { useState } from "react";
import type { OceanSummary } from "@/lib/types";

const fetcher = async (url: string): Promise<OceanSummary> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || `HTTP error ${res.status}`);
  }
  return res.json();
};

export function useOceanSummary() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<OceanSummary>(
    "/api/geo/data/summary",
    fetcher,
    {
      refreshInterval: 30000, // Revalidate every 30 seconds
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      shouldRetryOnError: true,
      errorRetryInterval: 10000,
    }
  );

  const refreshData = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/geo/data/refresh", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Refresh failed with status ${res.status}`);
      }
      // Re-fetch summary after backend refresh completes
      await mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRefreshError(msg);
      console.error("Failed to refresh geospatial data:", msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    summary: data,
    isLoading,
    error: error ? (error.message as string) : null,
    refreshData,
    isRefreshing,
    refreshError,
    mutate,
  };
}
