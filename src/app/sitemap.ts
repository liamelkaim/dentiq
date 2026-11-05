import type { MetadataRoute } from "next";

// Only the public pages. Private pages are not listed (and are disallowed in robots.txt).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return ["/", "/sign-in", "/sign-up", "/privacy", "/terms", "/cookies", "/accessibility", "/contact"].map((path) => ({ url: `${base}${path}` }));
}
