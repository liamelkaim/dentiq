// Which email domains may sign up. An administrator edits the list in Admin > Email domains (stored in app_settings);
// when nothing is stored, the ALLOWED_EMAIL_DOMAINS environment variable applies, and when that is empty every domain
// is allowed. A listed domain also allows its subdomains (umontreal.ca allows med.umontreal.ca). The single
// administrator named in ADMIN_EMAILS is exempt (see roles.ts).
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appSettings } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { hasRole } from "./roles";

export const EMAIL_DOMAINS_KEY = "emailDomains";
export const MAX_DOMAINS = 30;

/** One-click presets. UNVERIFIED: the faculty must confirm which addresses its students use (docs/open-questions.md). */
export const DOMAIN_PRESETS = { udem: ["umontreal.ca"] } as const;
export type DomainPreset = keyof typeof DOMAIN_PRESETS;

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** "@UMontreal.CA", "*.umontreal.ca" and " umontreal.ca. " all become "umontreal.ca"; anything else invalid is null. */
export function normalizeDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^@/, "").replace(/^\*\./, "").replace(/\.$/, "");
  return DOMAIN_RE.test(d) ? d : null;
}

/** Splits free text (commas, spaces, new lines) into unique valid domains. Returns null when any entry is invalid. */
export function parseDomainList(raw: string): string[] | null {
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const d = normalizeDomain(part);
    if (!d) return null;
    if (!out.includes(d)) out.push(d);
  }
  return out.length <= MAX_DOMAINS ? out : null;
}

export async function getStoredDomains(db: Database): Promise<string[]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, EMAIL_DOMAINS_KEY));
  const list = (row?.value as { domains?: unknown } | undefined)?.domains;
  return Array.isArray(list) ? list.filter((d): d is string => typeof d === "string" && normalizeDomain(d) === d) : [];
}

/** The list in force: stored by the admin, else the environment variable, else empty (= every domain allowed). */
export async function getAllowedDomains(db: Database, env = process.env.ALLOWED_EMAIL_DOMAINS): Promise<string[]> {
  const stored = await getStoredDomains(db);
  if (stored.length) return stored;
  return parseDomainList(env ?? "") ?? [];
}

export type DomainsError = "forbidden" | "invalid";

export async function updateAllowedDomains(
  db: Database,
  viewer: { id: string; role: "student" | "moderator" | "admin" },
  raw: string,
): Promise<{ ok: true; value: string[] } | { ok: false; error: DomainsError }> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  const domains = parseDomainList(raw);
  if (!domains) return { ok: false, error: "invalid" };
  const before = await getStoredDomains(db);
  await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: EMAIL_DOMAINS_KEY, value: { domains }, updatedBy: viewer.id })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: { domains }, updatedBy: viewer.id, updatedAt: new Date() } });
    await writeAudit(tx, { actorId: viewer.id, action: "auth.domains.update", entityType: "settings", entityId: EMAIL_DOMAINS_KEY, metadata: { before, after: domains } });
  });
  return { ok: true, value: domains };
}
