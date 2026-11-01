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
    // Every server action is capped small: they carry text forms and a 1 MB CSV import. Anything that sends files goes to
    // /api/uploads/<kind>, which checks its own size per kind after the session check (src/server/uploads).
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    // Framing, referrer and (production only) HSTS, plus the fixed policies for /api and the offline page: see
    // src/lib/security-headers.ts. Pages get their nonce-based Content-Security-Policy from src/proxy.ts.
    return buildHeaderRules({ production: process.env.NODE_ENV === "production", dev: process.env.NODE_ENV === "development" });
  },
  async rewrites() {
    // The offline page is a static file so the service worker can cache it; /offline is its friendly address.
    return { beforeFiles: [{ source: "/offline", destination: "/offline.html" }], afterFiles: [], fallback: [] };
  },
};

export default withNextIntl(nextConfig);
