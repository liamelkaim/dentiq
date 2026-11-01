"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js, the offline-safe shell (docs/pwa.md). Production only: in development a service worker would serve
 * stale files and confuse hot reloading. Renders nothing. A failure is ignored on purpose, the site works without it.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
