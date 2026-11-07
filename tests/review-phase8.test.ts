// Fixes from the independent review of finish/dentiq-polish. Each test failed before its fix.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, courses, feedback, recordings, user, userClassBlocks } from "@/db/schema";
import { buildAccountExport } from "@/server/account/export";
import { deleteAccount } from "@/server/account/delete";
import { createAuth } from "@/server/auth/auth";
import { parseIcs } from "@/server/calendar/ics";
import { importIcs, listClassBlocks } from "@/server/calendar/schedule-service";
import { seedProgram } from "@/server/catalog/program-seed";
import { setFeedbackDone, submitFeedback } from "@/server/feedback/service";
import { createRecording } from "@/server/recordings/service";
import { getRecordingSettings, recordingBodyLimit, updateRecordingSettings } from "@/server/recordings/settings";
import { createMemoryStorage } from "@/server/storage";
import { FORM_OVERHEAD_BYTES } from "@/server/uploads/read-body";

let db: Database;
const student = { id: "u1", role: "student" as const, emailVerified: true, approvalStatus: "approved" as const };
const admin = { id: "adm", role: "admin" as const, emailVerified: true, approvalStatus: "approved" as const };
beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "u1", name: "U1", email: "u1@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: "adm", name: "Adm", email: "adm@example.com", role: "admin", emailVerified: true, approvalStatus: "approved" },
  ]);
});

describe("1. feedback follows the account (Law 25)", () => {
  it("is in the data export and is erased with the account, including the contact email", async () => {
    const mailer = { send: async () => {} };
    await submitFeedback(db, "u1", { type: "idea", message: "A private thought about the app.", email: "u1@example.com", pageUrl: "/help", locale: "en" }, mailer, undefined);
    const exported = await buildAccountExport(db, "u1");
    expect(exported.ok && exported.value.json).toContain("A private thought about the app.");
    expect((await deleteAccount(db, createMemoryStorage(), "u1", "u1@example.com")).ok).toBe(true);
    expect(JSON.stringify(await db.select().from(feedback))).not.toContain("A private thought");
    expect(JSON.stringify(await db.select().from(feedback))).not.toContain("u1@example.com");
  });
  it("8. an invalid id is just 'not found', not a crash", async () => {
    expect(await setFeedbackDone(db, admin, "not-a-uuid", true)).toBe(false);
  });
});

describe("2 and 4. .ics import", () => {
  const ics = (rrule: string, start = "20301202T090000", end = "20301202T105000") => `BEGIN:VEVENT\r\nSUMMARY:TEST class\r\nDTSTART:${start}\r\nDTEND:${end}\r\n${rrule ? `RRULE:${rrule}\r\n` : ""}END:VEVENT`;
  it("a multi-day BYDAY rule becomes one class block per day", async () => {
    const r = await importIcs(db, student, ics("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20301213T235959", "20301202T090000"));
    expect(r).toEqual({ ok: true, value: { entries: 0, classBlocks: 2, skipped: 0 } });
    expect((await listClassBlocks(db, student)).map((b) => b.weekday).sort()).toEqual([1, 3]);
  });
  it("a BYDAY with ordinals or unknown days is skipped and counted, not guessed", async () => {
    const text = [ics("FREQ=WEEKLY;BYDAY=1MO;UNTIL=20301213T235959"), ics("FREQ=WEEKLY;BYDAY=XX;UNTIL=20301213T235959"), ics("", "20301120T150000", "20301120T160000")].join("\r\n");
    expect(await importIcs(db, student, text)).toEqual({ ok: true, value: { entries: 1, classBlocks: 0, skipped: 2 } });
  });
  it("one bad time or date skips that event instead of failing the whole import", async () => {
    const text = [ics("", "20301120T150000", "20301120T160000"), ics("", "20301120T250000", "20301120T260000"), ics("", "19990101T100000", "19990101T110000"), ics("FREQ=WEEKLY;COUNT=99999999", "20301120T100000", "20301120T110000")].join("\r\n");
    const r = await importIcs(db, student, text);
    expect(r).toMatchObject({ ok: true, value: { entries: 1, classBlocks: 0 } });
    expect(r.ok && r.value.skipped).toBe(3);
  });
  it("parseIcs rejects an impossible clock time", () => {
    expect(parseIcs(ics("", "20301120T250000", "20301120T260000")).events).toHaveLength(0);
  });
});

describe("3. password reset does not reveal accounts through timing or errors", () => {
  it("returns at once and without error for a known address even if the mail server is slow or down", async () => {
    const slowBroken = { send: async () => { await new Promise((r) => setTimeout(r, 400)); throw new Error("mail down"); } };
    const auth = createAuth(db, { nextjs: false, mailer: slowBroken });
    await auth.api.signUpEmail({ body: { name: "T", email: "known@example.com", password: "correct-horse-battery" } }).catch(() => null);
    const t0 = Date.now();
    await expect(auth.api.requestPasswordReset({ body: { email: "known@example.com", redirectTo: "/reset-password" } })).resolves.toBeTruthy();
    const known = Date.now() - t0;
    const t1 = Date.now();
    await auth.api.requestPasswordReset({ body: { email: "nobody@example.com", redirectTo: "/reset-password" } });
    const unknown = Date.now() - t1;
    expect(known).toBeLessThan(250);
    expect(Math.abs(known - unknown)).toBeLessThan(250);
  });
});

describe("5. recording uploads while OFF", () => {
  it("do not make the server buffer a large body", async () => {
    expect(recordingBodyLimit(await getRecordingSettings(db), FORM_OVERHEAD_BYTES)).toBeLessThanOrEqual(FORM_OVERHEAD_BYTES);
    await updateRecordingSettings(db, admin, { enabled: true });
    expect(recordingBodyLimit(await getRecordingSettings(db), FORM_OVERHEAD_BYTES)).toBeGreaterThan(FORM_OVERHEAD_BYTES);
  });
});

describe("6. account deletion scrubs recording audit ids", () => {
  it("leaves no recording id in the audit trail", async () => {
    await updateRecordingSettings(db, admin, { enabled: true });
    const mp4 = new Uint8Array(64);
    mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]); // M4A audio brand
    const r = await createRecording(db, createMemoryStorage(), student, { title: "TEST", consent: { recordingAllowed: true, lecturerPermission: true, privateUse: true } }, { name: "a.mp4", bytes: mp4 });
    if (!r.ok) throw new Error(r.error);
    await deleteAccount(db, createMemoryStorage(), "u1", "u1@example.com");
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain(r.value.id);
    expect(await db.select().from(recordings)).toHaveLength(0);
  });
});

describe("7. loading program data keeps an administrator's edits", () => {
  it("does not overwrite the title or credits of an existing course", async () => {
    const data = { program: { name_fr: "TEST", university: "TEST U", status: "VERIFIED" }, terms: [], courses: [{ code: "TEST 1", title_fr: "Titre officiel", programYear: 1, semester: 1, credits: 3, status: "VERIFIED" }] };
    await seedProgram(db, "adm", data, { institution: "udem", slug: "t" });
    await db.update(courses).set({ titleFr: "Titre corrigé par l'admin", credits: "4" }).where(eq(courses.code, "TEST 1"));
    await seedProgram(db, "adm", data, { institution: "udem", slug: "t" });
    const [c] = await db.select().from(courses);
    expect(c).toMatchObject({ titleFr: "Titre corrigé par l'admin", credits: "4.0", yearOfStudy: 1, typicalTerm: "fall" });
    expect(await db.select().from(userClassBlocks)).toHaveLength(0);
  });
});
