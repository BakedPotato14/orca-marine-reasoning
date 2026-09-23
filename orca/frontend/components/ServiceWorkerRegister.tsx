"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("ORCA PWA ServiceWorker registered with scope:", registration.scope);
          })
          .catch((error) => {
            console.warn("ORCA ServiceWorker registration failed:", error);
          });
      });
    }
  }, []);

  return null;
}
