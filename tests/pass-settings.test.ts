import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { appSettings, auditLog, user } from "@/db/schema";
import {
  canSubmitQuestionType,
  canVerifyAnswers,
  DEFAULT_PASS_SETTINGS,
  getPassSettings,
  normalizePassSettings,
  PASS_SETTINGS_KEY,
  updatePassSettings,
  validatePassSettings,
  type PassSettings,
} from "@/server/passes/settings";
import type { Viewer } from "@/server/resources/service";

const viewer = (id: string, role: Viewer["role"]): Viewer => ({ id, role, emailVerified: true, approvalStatus: "approved" });
const student = viewer("student", "student");
const moderator = viewer("mod", "moderator");
const admin = viewer("admin", "admin");

let db: Database;

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values(
    [student, moderator, admin].map((v) => ({ id: v.id, name: v.id, email: `${v.id}@example.com`, role: v.role, approvalStatus: "approved" as const })),
  );
});

describe("the current policy (defaults)", () => {
  it("accepts single, multiple, four-statement and open-answer questions", () => {
    expect(DEFAULT_PASS_SETTINGS.enabledQuestionTypes.sort()).toEqual(["kprim", "mc", "open", "sc"]);
  });

  it("lets only moderators and admins verify, and requires a basis note", () => {
    expect(DEFAULT_PASS_SETTINGS.verification).toMatchObject({ allowedRoles: ["moderator", "admin"], requireNote: true });
    expect(canVerifyAnswers(student, DEFAULT_PASS_SETTINGS)).toBe(false);
    expect(canVerifyAnswers(moderator, DEFAULT_PASS_SETTINGS)).toBe(true);
    expect(canVerifyAnswers(admin, DEFAULT_PASS_SETTINGS)).toBe(true);
  });

  it("is what you get when nothing has been saved", async () => {
    expect(await getPassSettings(db)).toEqual(DEFAULT_PASS_SETTINGS);
  });
});

describe("reading stored settings never widens permissions", () => {
  it("falls back to the defaults for garbage", () => {
    for (const junk of [null, undefined, 42, "text", [], { enabledQuestionTypes: "sc" }]) {
      expect(normalizePassSettings(junk)).toEqual(DEFAULT_PASS_SETTINGS);
    }
  });

  it("drops types the code no longer knows, and keeps the rest", () => {
    const s = normalizePassSettings({ enabledQuestionTypes: ["retired_type", "sc", "sc", 7] });
    expect(s.enabledQuestionTypes).toEqual(["sc"]);
    expect(normalizePassSettings({ enabledQuestionTypes: ["retired_type"] }).enabledQuestionTypes).toEqual(DEFAULT_PASS_SETTINGS.enabledQuestionTypes);
  });

  it("never lets plain students or unknown roles verify, and an admin can always verify", () => {
    const s = normalizePassSettings({ verification: { allowedRoles: ["student", "janitor", "moderator"] } });
    expect(s.verification.allowedRoles.sort()).toEqual(["admin", "moderator"]);
    const adminOnly = normalizePassSettings({ verification: { allowedRoles: [] } });
    expect(adminOnly.verification.allowedRoles).toEqual(["moderator", "admin"]);
    expect(normalizePassSettings({ verification: { allowedRoles: ["student"] } }).verification.allowedRoles).toEqual(["moderator", "admin"]);
  });

  it("replaces out-of-range numbers with the defaults", () => {
    const s = normalizePassSettings({ images: { maxPerQuestion: 99, maxBytes: 5 }, limits: { maxPendingPerUser: 0 }, verification: { minNoteLength: -1 } });
    expect(s.images).toEqual(DEFAULT_PASS_SETTINGS.images);
    expect(s.limits).toEqual(DEFAULT_PASS_SETTINGS.limits);
    expect(s.verification.minNoteLength).toBe(DEFAULT_PASS_SETTINGS.verification.minNoteLength);
  });

  it("applies a corrupted database row safely", async () => {
    await db.insert(appSettings).values({ key: PASS_SETTINGS_KEY, value: { verification: { allowedRoles: ["student"], requireNote: "no" } } });
    const s = await getPassSettings(db);
    expect(canVerifyAnswers(student, s)).toBe(false);
    expect(s.verification.requireNote).toBe(true);
  });
});

describe("changing the policy", () => {
  it("lets an administrator change who verifies, and saves it", async () => {
    const result = await updatePassSettings(db, admin, { verification: { allowedRoles: ["admin"] } });
    expect(result).toMatchObject({ ok: true });
    const s = await getPassSettings(db);
    expect(canVerifyAnswers(moderator, s)).toBe(false);
    expect(canVerifyAnswers(admin, s)).toBe(true);
    // The other settings were not reset by a partial change.
    expect(s.enabledQuestionTypes.sort()).toEqual(["kprim", "mc", "open", "sc"]);
    expect(s.verification.requireNote).toBe(true);
  });

  it("lets an administrator switch question types on and off", async () => {
    await updatePassSettings(db, admin, { enabledQuestionTypes: ["sc", "mc"] });
    const s = await getPassSettings(db);
    expect(canSubmitQuestionType(s, "sc")).toBe(true);
    expect(canSubmitQuestionType(s, "open")).toBe(false);
    expect(canSubmitQuestionType(s, "essay")).toBe(false);
  });

  it("records who changed what, with the before and after", async () => {
    await updatePassSettings(db, admin, { verification: { requireNote: false } });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "passes.settings.update"));
    expect(entry).toMatchObject({ actorId: "admin", entityId: PASS_SETTINGS_KEY });
    const meta = entry!.metadata as { before: PassSettings; after: PassSettings };
    expect(meta.before.verification.requireNote).toBe(true);
    expect(meta.after.verification.requireNote).toBe(false);
  });

  it("refuses anyone who is not an administrator", async () => {
    for (const who of [student, moderator]) {
      expect(await updatePassSettings(db, who, { enabledQuestionTypes: ["sc"] })).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await getPassSettings(db)).toEqual(DEFAULT_PASS_SETTINGS);
  });

  it("refuses unsafe or meaningless changes", async () => {
    const attempts: [Parameters<typeof updatePassSettings>[2], string][] = [
      [{ enabledQuestionTypes: [] }, "noQuestionTypes"],
      [{ enabledQuestionTypes: ["sc", "essay"] }, "unknownQuestionType"],
      [{ verification: { allowedRoles: ["moderator", "admin", "student"] } }, "invalidVerifierRole"],
      [{ verification: { allowedRoles: ["moderator"] } }, "adminMustVerify"],
      [{ verification: { minNoteLength: 9999 } }, "outOfRange"],
      [{ images: { maxPerQuestion: 11 } }, "outOfRange"],
      [{ limits: { maxPendingPerUser: 0 } }, "outOfRange"],
    ];
    for (const [patch, error] of attempts) {
      expect(await updatePassSettings(db, admin, patch), error).toEqual({ ok: false, error });
    }
    expect(await getPassSettings(db)).toEqual(DEFAULT_PASS_SETTINGS);
  });

  it("validates a whole settings object the same way", () => {
    expect(validatePassSettings(DEFAULT_PASS_SETTINGS)).toEqual({ ok: true });
    expect(validatePassSettings({ ...DEFAULT_PASS_SETTINGS, enabledQuestionTypes: [] })).toEqual({ ok: false, error: "noQuestionTypes" });
  });
});
