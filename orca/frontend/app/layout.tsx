/**
 * app/layout.tsx — ORCA Root Layout
 *
 * Provides: dark/light maritime theme, sticky top navigation bar, metadata, service worker.
 */
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeProvider } from "@/lib/theme";

export const viewport: Viewport = {
  themeColor: "#0B1120",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "ORCA — Ocean Risk & Coastal Advisory",
  description:
    "AI-powered marine safety advisory system for Indian Ocean fisheries. Real-time satellite telemetry, PFZ detection, and LangGraph multi-agent safety advisories.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ORCA Marine",
  },
  keywords: ["ORCA", "marine safety", "fishing zone", "PFZ", "Copernicus", "INCOIS", "coastal advisory", "India"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-screen flex flex-col font-sans selection:bg-cyan-400 selection:text-ocean-900"
        style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <ThemeProvider>
          <ServiceWorkerRegister />
          {/* Top Navigation Bar: sticky, 56px, blur, branding, live status, refresh, theme toggle */}
          <TopNav />

          {/* Main Content Shell */}
          <main className="flex-1 w-full flex flex-col">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
