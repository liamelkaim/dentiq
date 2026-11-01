// Security headers, kept free of imports so next.config.ts can load it and tests can read the exact policy.
// Rationale and trade-offs: docs/security-privacy.md ("Content Security Policy").

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** Routes that send their own Content-Security-Policy and framing headers (file previews, question images). */
export const OWN_HEADER_ROUTES = ["api/files/", "api/question-images/"] as const;

/**
 * One policy for every page. It is deliberately NOT nonce-based: a nonce needs a proxy that rewrites the request for every
 * page, and Next.js and next-themes both inject small inline scripts that would then each need the nonce. Without a browser
 * to check hydration, a policy that can silently break every page is the wrong trade. So scripts and styles allow
 * 'unsafe-inline' while everything else is locked to this origin. That still blocks injected external scripts, external
 * images or connections (data exfiltration), plugins, base-tag tricks, form posts to other sites, and framing.
 *
 * - 'unsafe-eval' only in development (React debugging); never in production.
 * - frame-src 'self': the PDF preview is an iframe on /api/files/..., which sets its own frame-ancestors 'self'.
 * - img-src data: blob: because the app previews and renders local images.
 * - worker-src 'self': the offline-shell service worker (/sw.js).
 */
export function buildCsp({ dev = false }: { dev?: boolean } = {}): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'"]],
    ["frame-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** Everything that is not one of the routes that set their own headers. */
const notOwnHeaderRoutes = (routes: readonly string[]) => `/((?!${routes.join("|")}).*)`;

export function buildHeaderRules({ production, dev = false }: { production: boolean; dev?: boolean }): HeaderRule[] {
  const rules: HeaderRule[] = [
    {
      // Everything except /api/files, which sets its own headers so previews can be framed by Dentiq.
      source: notOwnHeaderRoutes(["api/files/"]),
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
      ],
    },
    {
      source: notOwnHeaderRoutes(OWN_HEADER_ROUTES),
      headers: [{ key: "Content-Security-Policy", value: buildCsp({ dev }) }],
    },
    {
      // The browser re-checks the worker script on every load so a fix reaches people quickly.
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
    },
  ];
  if (production) {
    // Browsers ignore this over plain HTTP, so local `next start` is unaffected. No includeSubDomains or preload: those
    // are one-way decisions for the owner to take once the final domain is known.
    rules.push({ source: "/(.*)", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] });
  }
  return rules;
}
