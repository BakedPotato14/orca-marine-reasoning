"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waves, Menu, X, RefreshCw, Radio, Compass, Fish, ShieldAlert, ShieldCheck, AlertTriangle, Sun, Moon } from "lucide-react";
import { useOceanSummary } from "@/hooks/useOceanSummary";
import { useTheme } from "@/lib/theme";

export function TopNav() {
  const pathname = usePathname();
  const { summary, isRefreshing, refreshData } = useOceanSummary();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Determine current sea state from live summary data
  const overallStatus = summary?.marine_safety?.overall_status?.toUpperCase() || "NORMAL";

  let statusConfig = {
    label: "TRANQUIL",
    colorClass: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    dotClass: "bg-emerald-400 text-emerald-400",
    icon: ShieldCheck,
  };

  if (overallStatus.includes("ALERT") || overallStatus.includes("WARNING") || overallStatus.includes("DANGER")) {
    statusConfig = {
      label: "DANGER",
      colorClass: "text-red-400 bg-red-400/10 border-red-400/30",
      dotClass: "bg-red-400 text-red-400",
      icon: ShieldAlert,
    };
  } else if (overallStatus.includes("CAUTION") || overallStatus.includes("MODERATE")) {
    statusConfig = {
      label: "CAUTION",
      colorClass: "text-amber-400 bg-amber-400/10 border-amber-400/30",
      dotClass: "bg-amber-400 text-amber-400",
      icon: AlertTriangle,
    };
  }

  const StatusIcon = statusConfig.icon;

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: Compass },
    { href: "/map", label: "Map Explorer", icon: Radio },
    { href: "/pfz", label: "PFZ Advisor", icon: Fish },
  ];

  return (
    <>
      <header
        className="sticky top-0 z-50 h-14 border-b transition-colors"
        style={{
          backgroundColor: "var(--nav-bg)",
          borderColor: "var(--border)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div className="max-w-[1800px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Left: Hamburger (mobile) + ORCA Wordmark */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link href="/dashboard" className="flex items-center gap-2.5 group focus:outline-none">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform"
                style={{
                  backgroundColor: "rgba(34, 211, 238, 0.1)",
                  border: "1px solid rgba(34, 211, 238, 0.3)",
                  color: "var(--accent-cyan)",
                }}
              >
                <Waves size={19} strokeWidth={2.2} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-lg tracking-wider" style={{ color: "var(--text-primary)" }}>ORCA</span>
                <span
                  className="hidden sm:inline-block text-[10px] font-mono tracking-widest uppercase pl-2 ml-1"
                  style={{ color: "var(--text-muted)", borderLeft: "1px solid var(--border)" }}
                >
                  Marine Advisory
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1.5" aria-label="Main Navigation">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href === "/dashboard" && pathname === "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    isActive
                      ? "shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                      : ""
                  }`}
                  style={{
                    backgroundColor: isActive ? "rgba(34, 211, 238, 0.12)" : "transparent",
                    color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
                    border: isActive ? "1px solid rgba(34, 211, 238, 0.3)" : "1px solid transparent",
                  }}
                >
                  <Icon size={14} style={{ color: isActive ? "var(--accent-cyan)" : "var(--text-muted)" }} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: Sea State Pill + Theme Toggle + Refresh */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status Pill Badge */}
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono border font-medium transition-all ${statusConfig.colorClass}`}
              title={`Current Sea State: ${overallStatus}`}
              role="status"
              aria-live="polite"
            >
              <span className={`w-2 h-2 rounded-full zen-pulse ${statusConfig.dotClass}`} />
              <StatusIcon size={13} className="hidden xs:inline-block" />
              <span className="font-semibold">{statusConfig.label}</span>
            </div>

            {/* Global Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Refresh Ocean Data Button */}
            <button
              type="button"
              onClick={refreshData}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition active:scale-95 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
              title="Re-fetch Copernicus & satellite telemetry"
              aria-label="Refresh ocean data"
            >
              <RefreshCw
                size={13}
                style={{ color: "var(--accent-cyan)" }}
                className={isRefreshing ? "animate-spin" : ""}
              />
              <span className="hidden md:inline">Refresh Ocean Data</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-x-0 top-14 border-b p-4 z-40 flex flex-col gap-2"
          style={{
            backgroundColor: "var(--nav-bg)",
            borderColor: "var(--border)",
            backdropFilter: "blur(14px)",
          }}
        >
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href === "/dashboard" && pathname === "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition"
                style={{
                  backgroundColor: isActive ? "rgba(34, 211, 238, 0.1)" : "transparent",
                  color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
                  border: isActive ? "1px solid rgba(34, 211, 238, 0.3)" : "1px solid transparent",
                }}
              >
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
