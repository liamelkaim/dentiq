// Which request header may be trusted to carry the visitor's IP address. Better Auth keys its sign-in, sign-up and
// verification-email limits on that address, so a header anyone can forge would let an attacker dodge the limit by
// sending a different value every time.
//
// Rule: a forwarding header is only trustworthy when OUR OWN proxy sets or overwrites it. Browsers can send any header.
//   - On Vercel (VERCEL=1) the platform overwrites x-forwarded-for and x-real-ip with the real client address, so
//     x-forwarded-for is trusted automatically.
//   - Anywhere else the default is NO header: all clients then share one counter per path. That is safe (it cannot be
//     dodged) but coarse; set TRUSTED_IP_HEADER only when a proxy you control sits in front and overwrites that header.
//   - TRUSTED_IP_HEADER=x-forwarded-for | x-real-ip | cf-connecting-ip | fly-client-ip | none overrides the default.
//     Anything not on this list is ignored (treated as none), so a typo cannot open a hole.
// Documented for the owner in docs/hosting-plan.md.

export const KNOWN_IP_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "fly-client-ip"] as const;
export type IpHeader = (typeof KNOWN_IP_HEADERS)[number];

/** Header names to read the client IP from, in order. An empty list means: trust none. */
export function trustedIpHeaders(env: Record<string, string | undefined> = process.env): IpHeader[] {
  const configured = env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (configured === undefined || configured === "") return env.VERCEL === "1" ? ["x-forwarded-for"] : [];
  if (configured === "none") return [];
  return (KNOWN_IP_HEADERS as readonly string[]).includes(configured) ? [configured as IpHeader] : [];
}
