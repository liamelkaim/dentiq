// Changeable policy for exam passes, kept in one place and stored in the database (app_settings), so an
// administrator can change it without a code change or redeploy:
//   - which question types are accepted for NEW questions
//   - which roles may verify an answer, and whether a basis note is required
//   - image and anti-spam limits
//
// Changing a setting never touches existing questions or answers: a question verified under an earlier
// policy stays verified (who verified it, when, and on what basis is stored on the question itself), and a
// question of a type that is later switched off stays readable and editable.
//
// Safety: reading is forgiving but never widens permissions (an invalid stored value becomes the strict
// default; an administrator can always verify). Writing is strict and audited.
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appSettings, roles, type Role } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { canContribute, hasRole } from "@/server/auth/roles";
import type { Viewer } from "@/server/resources/service";
import { getQuestionType, knownQuestionTypes } from "./question-types";

export const PASS_SETTINGS_KEY = "passes";

export type PassSettings = {
  /** Types accepted for NEW questions (must exist in the registry). */
  enabledQuestionTypes: string[];
  verification: {
    allowedRoles: Role[];
    requireNote: boolean;
    minNoteLength: number;
  };
  images: { maxPerQuestion: number; maxBytes: number };
  limits: { maxPendingPerUser: number };
};

export type PassSettingsPatch = {
  enabledQuestionTypes?: string[];
  verification?: Partial<PassSettings["verification"]>;
  images?: Partial<PassSettings["images"]>;
  limits?: Partial<PassSettings["limits"]>;
};

/** Current policy: all five kinds of question; only moderators and admins verify, with a basis note. */
export const DEFAULT_PASS_SETTINGS: PassSettings = {
  enabledQuestionTypes: [...knownQuestionTypes],
  verification: { allowedRoles: ["moderator", "admin"], requireNote: true, minNoteLength: 10 },
  images: { maxPerQuestion: 4, maxBytes: 5 * 1024 * 1024 },
  limits: { maxPendingPerUser: 25 },
};

/** Roles that may ever be given the right to verify: everyone above a plain student (future roles included). */
export const VERIFIER_ELIGIBLE_ROLES: readonly Role[] = roles.filter((r) => r !== "student");

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

const BOUNDS = {
  minNoteLength: [0, 500],
  maxPerQuestion: [0, 10],
  maxBytes: [100 * 1024, 10 * 1024 * 1024],
  maxPendingPerUser: [1, 500],
} as const;

/** Forgiving read: fixes or replaces bad parts with safe defaults. Never throws, never widens permissions. */
export function normalizePassSettings(raw: unknown): PassSettings {
  const d = DEFAULT_PASS_SETTINGS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const v = (r.verification && typeof r.verification === "object" ? r.verification : {}) as Record<string, unknown>;
  const im = (r.images && typeof r.images === "object" ? r.images : {}) as Record<string, unknown>;
  const li = (r.limits && typeof r.limits === "object" ? r.limits : {}) as Record<string, unknown>;

  const types = Array.isArray(r.enabledQuestionTypes)
    ? [...new Set(r.enabledQuestionTypes.filter((t): t is string => typeof t === "string" && getQuestionType(t) !== null))]
    : [];

  const storedRoles = Array.isArray(v.allowedRoles)
    ? v.allowedRoles.filter((x): x is Role => typeof x === "string" && (VERIFIER_ELIGIBLE_ROLES as readonly string[]).includes(x))
    : [];
  const allowedRoles = [...new Set<Role>(storedRoles.length ? [...storedRoles, "admin"] : d.verification.allowedRoles)];

  return {
    enabledQuestionTypes: types.length ? types : [...d.enabledQuestionTypes],
    verification: {
      allowedRoles,
      requireNote: typeof v.requireNote === "boolean" ? v.requireNote : d.verification.requireNote,
      minNoteLength: isInt(v.minNoteLength, ...BOUNDS.minNoteLength) ? v.minNoteLength : d.verification.minNoteLength,
    },
    images: {
      maxPerQuestion: isInt(im.maxPerQuestion, ...BOUNDS.maxPerQuestion) ? im.maxPerQuestion : d.images.maxPerQuestion,
      maxBytes: isInt(im.maxBytes, ...BOUNDS.maxBytes) ? im.maxBytes : d.images.maxBytes,
    },
    limits: {
      maxPendingPerUser: isInt(li.maxPendingPerUser, ...BOUNDS.maxPendingPerUser) ? li.maxPendingPerUser : d.limits.maxPendingPerUser,
    },
  };
}

export type SettingsError =
  | "noQuestionTypes"
  | "unknownQuestionType"
  | "invalidVerifierRole"
  | "adminMustVerify"
  | "outOfRange";

/** Strict check used when SAVING a change. */
export function validatePassSettings(s: PassSettings): { ok: true } | { ok: false; error: SettingsError } {
  if (s.enabledQuestionTypes.length === 0) return { ok: false, error: "noQuestionTypes" };
  if (s.enabledQuestionTypes.some((t) => getQuestionType(t) === null)) return { ok: false, error: "unknownQuestionType" };
  if (s.verification.allowedRoles.some((r) => !(VERIFIER_ELIGIBLE_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: "invalidVerifierRole" };
  }
  if (!s.verification.allowedRoles.includes("admin")) return { ok: false, error: "adminMustVerify" };
  const ranges: [number, readonly [number, number]][] = [
    [s.verification.minNoteLength, BOUNDS.minNoteLength],
    [s.images.maxPerQuestion, BOUNDS.maxPerQuestion],
    [s.images.maxBytes, BOUNDS.maxBytes],
    [s.limits.maxPendingPerUser, BOUNDS.maxPendingPerUser],
  ];
  if (ranges.some(([value, [min, max]]) => !isInt(value, min, max))) return { ok: false, error: "outOfRange" };
  return { ok: true };
}

export async function getPassSettings(db: Database): Promise<PassSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PASS_SETTINGS_KEY));
  return normalizePassSettings(row?.value);
}

/** Administrators only. Merges a partial change into the current settings, validates, saves and audits. */
export async function updatePassSettings(
  db: Database,
  viewer: Viewer,
  patch: PassSettingsPatch,
): Promise<{ ok: true; value: PassSettings } | { ok: false; error: SettingsError | "forbidden" }> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  const before = await getPassSettings(db);
  const after: PassSettings = {
    enabledQuestionTypes: patch.enabledQuestionTypes ?? before.enabledQuestionTypes,
    verification: { ...before.verification, ...patch.verification },
    images: { ...before.images, ...patch.images },
    limits: { ...before.limits, ...patch.limits },
  };
  const check = validatePassSettings(after);
  if (!check.ok) return check;

  await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: PASS_SETTINGS_KEY, value: after, updatedBy: viewer.id })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: after, updatedBy: viewer.id, updatedAt: new Date() } });
    await writeAudit(tx, {
      actorId: viewer.id,
      action: "passes.settings.update",
      entityType: "settings",
      entityId: PASS_SETTINGS_KEY,
      metadata: { before, after },
    });
  });
  return { ok: true, value: after };
}

/** May this person verify answers under the current policy? */
export function canVerifyAnswers(viewer: Viewer, settings: PassSettings): boolean {
  // Eligibility first: a rejected, pending or unverified account holds no role, whatever its stored role is.
  return canContribute(viewer) && settings.verification.allowedRoles.includes(viewer.role);
}

/** Is this type accepted for NEW questions right now? (Existing questions of any type stay usable.) */
export function canSubmitQuestionType(settings: PassSettings, typeKey: string): boolean {
  return getQuestionType(typeKey) !== null && settings.enabledQuestionTypes.includes(typeKey);
}
