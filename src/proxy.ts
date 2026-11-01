// Runs before every page request and gives the page its Content-Security-Policy with a fresh nonce (Next.js 16 "proxy",
// the renamed middleware; see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
//
// How it works: the nonce goes into the policy header on the REQUEST. While rendering, Next.js reads it from there and
// puts it on its own scripts; the root layout reads it from x-nonce and hands it to next-themes. The same policy is sent
// on the RESPONSE so the browser enforces it. Because the nonce is new for each request, every page is rendered per
// request (they all are already: the layout reads the language cookie and the session).
//
// Not run for: API routes (data, they get a fixed policy in next.config.ts), Next static assets and images, the service
// worker, the manifest, the offline page and icons (static files, no nonce possible), link prefetches (no HTML rendered),
// and server-action posts (their body must not be buffered by the proxy; the response is data, not a page).
import { NextResponse, type NextRequest } from "next/server";
import { buildNonceCsp, createNonce } from "@/lib/security-headers";

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = buildNonceCsp(nonce, { dev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline|icon-|brand/|icon.png|apple-icon.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
        { type: "header", key: "next-action" },
      ],
    },
  ],
};
