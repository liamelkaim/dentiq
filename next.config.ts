import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildHeaderRules } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // PGlite ships WASM and data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  experimental: {
    // Enables forbidden() for server-side role checks.
    authInterrupts: true,
    // Document uploads go through server actions (25 MB file limit + form fields).
    serverActions: { bodySizeLimit: "26mb" },
  },
  async headers() {
    // Content-Security-Policy, framing, referrer and (production only) HSTS: see src/lib/security-headers.ts.
    return buildHeaderRules({ production: process.env.NODE_ENV === "production", dev: process.env.NODE_ENV === "development" });
  },
  async rewrites() {
    // The offline page is a static file so the service worker can cache it; /offline is its friendly address.
    return { beforeFiles: [{ source: "/offline", destination: "/offline.html" }], afterFiles: [], fallback: [] };
  },
};

export default withNextIntl(nextConfig);
