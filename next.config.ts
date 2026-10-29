import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
    return [
      {
        // Everything except /api/files, which sets its own headers so previews can be framed by DentOS.
        source: "/((?!api/files/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
