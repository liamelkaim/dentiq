import type { MetadataRoute } from "next";

// Public pages may be indexed; every signed-in page and every API route is disallowed.
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/analytics", "/calendar", "/courses", "/help", "/moderation", "/notes", "/onboarding", "/passes", "/practice", "/profile", "/recordings", "/resources", "/search", "/settings", "/study", "/tutor", "/verify-email", "/reset-password", "/welcome"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
