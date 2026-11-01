// Security headers, kept free of imports so next.config.ts can load it and tests can read the exact policy.
// Rationale and trade-offs: docs/security-privacy.md ("Content Security Policy").

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** Routes that send their own Content-Security-Policy and framing headers (file previews, question images). */
export const OWN_HEADER_ROUTES = ["api/files/", "api/question-images/"] as const;

/** Directives that do not depend on how scripts are allowed; shared by the page policy and the static-file policy. */
function baseDirectives(): [string, string[]][] {
  return [
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
}

const serialize = (directives: [string, string[]][]) => directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");

/**
 * The policy for every PAGE, built per request by src/proxy.ts with a fresh nonce (Next.js reads the nonce from this
 * header while rendering and puts it on its own scripts; next-themes gets it from the layout). Scripts run only when they
 * carry the nonce, or were loaded by a script that does ('strict-dynamic'); there is NO 'unsafe-inline' for scripts, so an
 * injected inline script or event-handler attribute does not run.
 *
 * - Styles keep 'unsafe-inline' on purpose: React and Tailwind use style attributes that a nonce cannot cover, and a style
 *   cannot run code. (Adding a nonce to style-src would make browsers ignore 'unsafe-inline' and break those attributes.)
 * - 'unsafe-eval' only in development (React debugging); never in production.
 * - frame-src 'self': the PDF preview is an iframe on /api/files/..., which sets its own frame-ancestors 'self'.
 * - img-src data: blob: because the app previews and renders local images.
 * - worker-src 'self': the offline-shell service worker (/sw.js).
 * Everything external stays blocked: scripts, images, connections, plugins, base-tag tricks, foreign form posts, framing.
 */
export function buildNonceCsp(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  return serialize([["default-src", ["'self'"]], ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]], ...baseDirectives()]);
}

/**
 * The fixed policy for the few static HTML files that cannot carry a nonce (the offline page, which has one small inline
 * script). Same restrictions, but inline scripts are allowed there. No user content is ever served from these files.
 */
export function buildCsp({ dev = false }: { dev?: boolean } = {}): string {
  return serialize([["default-src", ["'self'"]], ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])]], ...baseDirectives()]);
}

/** Download and JSON routes (exports, auth): they are never rendered as a page, so nothing may load or run. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** A fresh, unpredictable nonce for one request (128 random bits, base64). */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
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
      // Pages get their policy (with a nonce) from src/proxy.ts. Routes under /api answer data, never a page.
      source: `/api/((?!${OWN_HEADER_ROUTES.map((r) => r.replace(/^api\//, "")).join("|")}).*)`,
      headers: [{ key: "Content-Security-Policy", value: API_CSP }],
    },
    {
      // Static file with one inline script that cannot carry a nonce (the proxy does not run for it).
      source: "/offline",
      headers: [{ key: "Content-Security-Policy", value: buildCsp({ dev }) }],
    },
    {
      source: "/offline.html",
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
