"use client";

import useSWR from "swr";
import type { PFZListResponse, GeoJSONFeatureCollection } from "@/lib/types";

interface PFZFilterParams {
  category?: string;
  state?: string;
  min_score?: number;
  limit?: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || errData.details || `Failed to fetch PFZ data: ${res.status}`);
  }
  return res.json();
};

export function usePFZList(params?: PFZFilterParams) {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.state) query.set("state", params.state);
  if (params?.min_score !== undefined) query.set("min_score", params.min_score.toString());
  if (params?.limit !== undefined) query.set("limit", params.limit.toString());

  const queryString = query.toString();
  const url = `/api/geo/data/pfz${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<PFZListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  });

  return {
    hotspots: data?.hotspots ?? [],
    totalCount: data?.total_available ?? 0,
    count: data?.count ?? 0,
    isLoading,
    error: error ? (error.message as string) : null,
    mutate,
  };
}

export function usePFZGeoJSON() {
  const { data, error, isLoading, mutate } = useSWR<GeoJSONFeatureCollection>(
    "/api/geo/data/pfz-geojson",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  );

  return {
    geoJson: data,
    isLoading,
    error: error ? (error.message as string) : null,
    mutate,
  };
}
