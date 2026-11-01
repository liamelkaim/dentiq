// Administrator-changeable tutor settings, stored in app_settings (same pattern as src/server/passes/settings.ts).
// Reading is forgiving and never turns the tutor ON by accident: a missing or invalid value means OFF / the default.
// Writing is strict and audited. Turning the flag on does NOTHING without a configured provider (see service.ts).
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appSettings } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { hasRole } from "@/server/auth/roles";
import type { Viewer } from "@/server/resources/service";
import {
  DAILY_QUESTION_LIMIT_BOUNDS,
  DEFAULT_DAILY_QUESTION_LIMIT,
  DEFAULT_MAX_CONTEXT_CHARS,
  DEFAULT_TUTOR_ENABLED,
  MAX_CONTEXT_CHARS_BOUNDS,
  TUTOR_SETTINGS_KEY,
} from "./constants";

export type TutorSettings = {
  /** Feature flag. Default OFF. Both this AND a configured provider are required before any answer is possible. */
  enabled: boolean;
  dailyQuestionLimit: number;
  maxContextChars: number;
};

export const DEFAULT_TUTOR_SETTINGS: TutorSettings = {
  enabled: DEFAULT_TUTOR_ENABLED,
  dailyQuestionLimit: DEFAULT_DAILY_QUESTION_LIMIT,
  maxContextChars: DEFAULT_MAX_CONTEXT_CHARS,
};

const isInt = (v: unknown, [min, max]: readonly [number, number]): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Forgiving read: bad parts become the defaults. Only a stored boolean `true` turns the flag on. */
export function normalizeTutorSettings(raw: unknown): TutorSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    dailyQuestionLimit: isInt(r.dailyQuestionLimit, DAILY_QUESTION_LIMIT_BOUNDS) ? r.dailyQuestionLimit : DEFAULT_TUTOR_SETTINGS.dailyQuestionLimit,
    maxContextChars: isInt(r.maxContextChars, MAX_CONTEXT_CHARS_BOUNDS) ? r.maxContextChars : DEFAULT_TUTOR_SETTINGS.maxContextChars,
  };
}

export type TutorSettingsError = "outOfRange" | "forbidden";

export function validateTutorSettings(s: TutorSettings): boolean {
  return typeof s.enabled === "boolean" && isInt(s.dailyQuestionLimit, DAILY_QUESTION_LIMIT_BOUNDS) && isInt(s.maxContextChars, MAX_CONTEXT_CHARS_BOUNDS);
}

export async function getTutorSettings(db: Database): Promise<TutorSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, TUTOR_SETTINGS_KEY));
  return normalizeTutorSettings(row?.value);
}

/** Administrators only. Merges a partial change into the current settings, validates, saves and audits. */
export async function updateTutorSettings(
  db: Database,
  viewer: Viewer,
  patch: Partial<TutorSettings>,
): Promise<{ ok: true; value: TutorSettings } | { ok: false; error: TutorSettingsError }> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  const before = await getTutorSettings(db);
  const after: TutorSettings = { ...before, ...patch };
  if (!validateTutorSettings(after)) return { ok: false, error: "outOfRange" };

  await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: TUTOR_SETTINGS_KEY, value: after, updatedBy: viewer.id })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: after, updatedBy: viewer.id, updatedAt: new Date() } });
    await writeAudit(tx, {
      actorId: viewer.id,
      action: "tutor.settings.update",
      entityType: "settings",
      entityId: TUTOR_SETTINGS_KEY,
      metadata: { before, after },
    });
  });
  return { ok: true, value: after };
}
