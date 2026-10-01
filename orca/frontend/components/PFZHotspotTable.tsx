"use client";

import React, { useState, useMemo } from "react";
import { Fish, Search, ArrowUpDown, ChevronDown, ChevronUp, MapPin, Navigation } from "lucide-react";
import type { PFZHotspot } from "@/lib/types";
import { formatCoord } from "@/lib/utils";

interface PFZHotspotTableProps {
  hotspots: PFZHotspot[];
  isLoading?: boolean;
  onSelectHotspot?: (coords: { lat: number; lon: number; id: string }) => void;
}

export function PFZHotspotTable({
  hotspots,
  isLoading,
  onSelectHotspot,
}: PFZHotspotTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"id" | "distance" | "score">("distance");
  const [sortAsc, setSortAsc] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredHotspots = useMemo(() => {
    return hotspots
      .filter((h) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
          h.id.toLowerCase().includes(q) ||
          (h.nearest_port && h.nearest_port.toLowerCase().includes(q)) ||
          (h.target_species && h.target_species.toLowerCase().includes(q)) ||
          (h.category && h.category.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === "distance") {
          const distA = a.distance_km ?? 999;
          const distB = b.distance_km ?? 999;
          return sortAsc ? distA - distB : distB - distA;
        } else if (sortBy === "score") {
          const scoreA = a.pfz_score ?? 0;
          const scoreB = b.pfz_score ?? 0;
          return sortAsc ? scoreA - scoreB : scoreB - scoreA;
        } else {
          return sortAsc
            ? a.id.localeCompare(b.id)
            : b.id.localeCompare(a.id);
        }
      });
  }, [hotspots, searchTerm, sortBy, sortAsc]);

  const toggleSort = (field: "id" | "distance" | "score") => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(true);
    }
  };

  const getProbabilityBadge = (category: string) => {
    const cat = category?.toLowerCase() || "";
    if (cat.includes("high")) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">
          High
        </span>
      );
    } else if (cat.includes("mod") || cat.includes("med")) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-400/15 text-amber-400 border border-amber-400/30">
          Medium
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30">
        Low
      </span>
    );
  };

  return (
    <div className="bg-ocean-800/90 border border-ocean-600/70 rounded-xl shadow-md backdrop-blur-md overflow-hidden">
      {/* Table Header & Toggle */}
      <div className="p-3 px-4 flex items-center justify-between border-b border-ocean-700/70 bg-ocean-900/60">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-slate-200 hover:text-cyan-400 transition"
        >
          <Fish size={16} className="text-cyan-400" />
          <span>PFZ Hotspot Ledgers ({filteredHotspots.length})</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search port or zone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-ocean-700/80 border border-ocean-600 text-slate-200 text-xs rounded-lg pl-7 pr-2.5 py-1 w-36 sm:w-44 outline-none focus:border-cyan-400 font-sans"
            />
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-ocean-900/80 sticky top-0 z-10 text-[11px] font-mono text-slate-400 uppercase tracking-wider border-b border-ocean-700">
              <tr>
                <th
                  onClick={() => toggleSort("id")}
                  className="py-2 px-3 cursor-pointer hover:text-cyan-400"
                >
                  <div className="flex items-center gap-1">
                    <span>Zone ID</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="py-2 px-3">Coordinates</th>
                <th
                  onClick={() => toggleSort("distance")}
                  className="py-2 px-3 cursor-pointer hover:text-cyan-400 text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Dist (km)</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="py-2 px-3 text-center">Probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-700/50">
              {filteredHotspots.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                    No matching PFZ hotspots found.
                  </td>
                </tr>
              ) : (
                filteredHotspots.map((h, idx) => (
                  <tr
                    key={h.id || idx}
                    onClick={() => {
                      if (onSelectHotspot) {
                        onSelectHotspot({ lat: h.latitude, lon: h.longitude, id: h.id });
                      }
                    }}
                    className={`cursor-pointer transition-colors hover:bg-cyan-400/10 ${
                      idx % 2 === 0 ? "bg-ocean-800/40" : "bg-ocean-700/20"
                    }`}
                    title="Click to view & zoom to this zone on the map"
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                      <Navigation size={12} className="opacity-60" />
                      <span>{h.id}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 text-[11px]">
                      {formatCoord(h.latitude, h.longitude)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-200 text-right font-semibold">
                      {h.distance_km !== undefined ? `${h.distance_km.toFixed(0)} km` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {getProbabilityBadge(h.category)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
