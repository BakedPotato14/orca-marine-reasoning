/**
 * app/layout.tsx — ORCA Root Layout
 *
 * Provides: dark maritime body, top navigation bar, font imports, metadata.
 * All pages inherit this shell.
 */
import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { Waves } from "lucide-react";

export const metadata: Metadata = {
  title: "ORCA — Ocean Risk & Coastal Advisory",
  description:
    "Marine safety AI platform for Indian coastal fishermen. Real-time satellite oceanographic data, AI-powered advisories, and fishing zone intelligence.",
  keywords: ["ORCA", "marine safety", "fishing zone", "PFZ", "INCOIS", "coastal advisory", "India"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* ----------------------------------------------------------------
            Top Navigation Bar
            ---------------------------------------------------------------- */}
        <header
          style={{
            background: "rgba(10, 12, 16, 0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <nav
            style={{
              maxWidth: "100%",
              padding: "0 24px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              gap: "32px",
            }}
          >
            {/* Brand */}
            <Link
              href="/dashboard"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
                color: "var(--accent-cyan)",
              }}
            >
              <Waves size={22} strokeWidth={2} />
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  letterSpacing: "0.08em",
                  color: "var(--text-primary)",
                }}
              >
                ORCA
              </span>
              <span
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent-cyan)",
                  letterSpacing: "0.1em",
                  fontWeight: 500,
                  paddingLeft: "4px",
                }}
              >
                MARINE AI
              </span>
            </Link>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Nav links */}
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/map" label="Map Explorer" />
            <NavLink href="/pfz" label="PFZ Advisor" />

            {/* Status dot */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: "var(--accent-emerald)",
                  boxShadow: "0 0 6px var(--accent-emerald)",
                  display: "inline-block",
                }}
              />
              LIVE
            </div>
          </nav>
        </header>

        {/* Page content */}
        <main style={{ minHeight: "calc(100vh - 56px)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}

/** Individual navigation link with hover underline */
function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="nav-link">
      {label}
    </Link>
  );
}
