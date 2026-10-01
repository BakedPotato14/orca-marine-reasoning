"use client";

import React, { useState, useMemo } from "react";
import type { PFZHotspot } from "@/lib/types";
import { formatCoord, pfzCategoryToHex } from "@/lib/utils";
import { Fish, Search, ArrowUpDown, Anchor, Navigation, ShieldCheck } from "lucide-react";

interface PFZTableProps {
  hotspots: PFZHotspot[];
  isLoading: boolean;
  onSelectHotspot?: (hotspot: PFZHotspot) => void;
}

export function PFZTable({ hotspots, isLoading, onSelectHotspot }: PFZTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [sortBy, setSortBy] = useState<"score" | "distance">("score");
  const [sortAsc, setSortAsc] = useState(false);

  const states = useMemo(() => {
    const set = new Set<string>();
    hotspots.forEach((h) => {
      if (h.state) set.add(h.state);
    });
    return ["ALL", ...Array.from(set).sort()];
  }, [hotspots]);

  const filteredHotspots = useMemo(() => {
    return hotspots
      .filter((h) => {
        if (selectedState !== "ALL" && h.state !== selectedState) return false;
        if (selectedCategory !== "ALL" && !h.category.toLowerCase().includes(selectedCategory.toLowerCase())) {
          return false;
        }
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          const matchSpecies = h.target_species?.toLowerCase().includes(s);
          const matchPort = h.nearest_port?.toLowerCase().includes(s);
          const matchState = h.state?.toLowerCase().includes(s);
          if (!matchSpecies && !matchPort && !matchState) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "score") {
          return sortAsc ? a.pfz_score - b.pfz_score : b.pfz_score - a.pfz_score;
        } else {
          return sortAsc ? a.distance_km - b.distance_km : b.distance_km - a.distance_km;
        }
      });
  }, [hotspots, selectedState, selectedCategory, searchTerm, sortBy, sortAsc]);

  const toggleSort = (field: "score" | "distance") => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Title & Filter Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(212, 175, 55, 0.08)",
              border: "1px solid rgba(212, 175, 55, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-gold)",
            }}
          >
            <Fish size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-serif)" }}>
              Potential Fishing Zones (PFZ)
            </h3>
            <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              Thermal & Chlorophyll oceanic frontal confluence ledgers
            </span>
          </div>
        </div>

        {/* Filter inputs */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(220, 212, 198, 0.04)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "5px 10px",
            }}
          >
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Species, port..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
                outline: "none",
                width: "120px",
              }}
            />
          </div>

          {/* State Filter */}
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            style={{
              backgroundColor: "rgba(18, 19, 22, 0.95)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              borderRadius: "6px",
              padding: "5px 10px",
              fontSize: "0.8rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          >
            {states.map((st) => (
              <option key={st} value={st}>
                {st === "ALL" ? "All Coastal States" : st}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              backgroundColor: "rgba(18, 19, 22, 0.95)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              borderRadius: "6px",
              padding: "5px 10px",
              fontSize: "0.8rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          >
            <option value="ALL">All Probabilities</option>
            <option value="High">High Probability (High Confluence)</option>
            <option value="Moderate">Moderate Probability</option>
            <option value="Promising">Promising Edge</option>
          </select>
        </div>
      </div>

      {/* Hotspots Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>Hotspot / Species</th>
              <th style={{ padding: "8px 10px" }}>Probability Category</th>
              <th
                style={{ padding: "8px 10px", cursor: "pointer" }}
                onClick={() => toggleSort("score")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>PFZ Score</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: "8px 10px" }}>SST / Chl-a</th>
              <th
                style={{ padding: "8px 10px", cursor: "pointer" }}
                onClick={() => toggleSort("distance")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>Port Vector</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: "8px 10px" }}>Position</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                  Loading PFZ oceanic hotspots from Copernicus / INCOIS feeds...
                </td>
              </tr>
            ) : filteredHotspots.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                  No PFZ hotspots matching current filters.
                </td>
              </tr>
            ) : (
              filteredHotspots.map((h) => {
                const catColor = pfzCategoryToHex(h.category);
                return (
                  <tr
                    key={h.id}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                      transition: "background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255, 255, 255, 0.02)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                  >
                    <td style={{ padding: "10px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {h.target_species || "Pelagic Shoals"}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {h.id}
                      </div>
                    </td>

                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          backgroundColor: `${catColor}18`,
                          border: `1px solid ${catColor}50`,
                          color: catColor,
                          padding: "3px 8px",
                          borderRadius: "9999px",
                          fontSize: "0.72rem",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                        }}
                      >
                        {h.category}
                      </span>
                    </td>

                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="mono" style={{ fontWeight: 700, color: catColor }}>
                          {h.pfz_score}
                        </span>
                        <div
                          style={{
                            width: "50px",
                            height: "5px",
                            borderRadius: "3px",
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, h.pfz_score)}%`,
                              height: "100%",
                              backgroundColor: catColor,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "10px" }}>
                      <div className="mono" style={{ fontSize: "0.78rem" }}>
                        <span style={{ color: "var(--accent-cyan)" }}>{h.sst_celsius?.toFixed(1) || "28.2"}°C</span>
                        <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>|</span>
                        <span style={{ color: "var(--accent-emerald)" }}>{h.chl_mg_m3?.toFixed(2) || "0.65"} mg/m³</span>
                      </div>
                    </td>

                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        <Anchor size={12} color="var(--text-muted)" />
                        <span>{h.distance_km ? `${h.distance_km.toFixed(0)} km ${h.bearing}` : "Offshore"}</span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        from {h.nearest_port || h.state}
                      </div>
                    </td>

                    <td style={{ padding: "10px" }}>
                      <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {formatCoord(h.latitude, h.longitude)}
                      </span>
                    </td>

                    <td style={{ padding: "10px", textAlign: "right" }}>
                      {onSelectHotspot && (
                        <button
                          type="button"
                          onClick={() => onSelectHotspot(h)}
                          style={{
                            backgroundColor: "rgba(212, 175, 55, 0.08)",
                            border: "1px solid rgba(212, 175, 55, 0.3)",
                            color: "var(--accent-gold)",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(212, 175, 55, 0.18)";
                            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 10px rgba(212, 175, 55, 0.2)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(212, 175, 55, 0.08)";
                            (e.currentTarget as HTMLElement).style.boxShadow = "none";
                          }}
                        >
                          <ShieldCheck size={13} />
                          <span>Assess</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
