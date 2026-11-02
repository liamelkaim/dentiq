// Feedback flow: validation, storage, privacy of the page address, admin notice, admin-only reading, rate limit. Synthetic data only.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { feedback, user } from "@/db/schema";
import type { EmailMessage, Mailer } from "@/server/email";
import { listFeedback, parseFeedback, pathOnly, setFeedbackDone, submitFeedback } from "@/server/feedback/service";
import { RATE_FEEDBACK, rateKey } from "@/server/rate-limit/limits";
import { consumeAttempt } from "@/server/rate-limit/service";

let db: Database;
let sent: EmailMessage[];
const mailer: Mailer = { send: async (m) => void sent.push(m) };
const admin = { id: "adm", role: "admin" as const, emailVerified: true, approvalStatus: "approved" as const };
const student = { id: "stu", role: "student" as const, emailVerified: true, approvalStatus: "approved" as const };
const good = { type: "bug", message: "The calendar page is slow on my phone.", email: "", pageUrl: "https://dentiq.test/calendar?token=SECRET&x=1#top", locale: "en" };

beforeEach(async () => {
  db = await createTestDatabase();
  sent = [];
  await db.insert(user).values([
    { id: "adm", name: "Adm", email: "adm@example.com", role: "admin", emailVerified: true, approvalStatus: "approved" },
    { id: "stu", name: "Stu", email: "stu@example.com", emailVerified: true, approvalStatus: "approved" },
  ]);
});

describe("validation", () => {
  it.each([
    [{ ...good, type: "spam" }, "invalidType"],
    [{ ...good, type: undefined }, "invalidType"],
    [{ ...good, message: "hi" }, "messageTooShort"],
    [{ ...good, message: "   \n  " }, "messageTooShort"],
    [{ ...good, message: "x".repeat(2001) }, "messageTooLong"],
    [{ ...good, email: "not an email" }, "invalidEmail"],
  ])("rejects %j", (input, error) => expect(parseFeedback(input)).toEqual({ ok: false, error }));
  it("accepts a good message, an optional email, and trims", () => {
    expect(parseFeedback({ ...good, email: " me@umontreal.ca ", message: "  Works fine.  " })).toMatchObject({ ok: true, value: { type: "bug", message: "Works fine.", email: "me@umontreal.ca", locale: "en" } });
    expect(parseFeedback({ ...good, locale: "de" })).toMatchObject({ value: { locale: "fr" } });
  });
});

describe("the page address", () => {
  it("keeps only the path: no query string, no fragment, no other site", () => {
    expect(pathOnly("https://dentiq.test/calendar?token=SECRET#top")).toBe("/calendar");
    expect(pathOnly("/reset-password?token=abc")).toBe("/reset-password");
    expect(pathOnly("javascript:alert(1)")).toBe("/");
    expect(pathOnly(42)).toBe("/");
    expect(pathOnly("/" + "a".repeat(500)).length).toBeLessThanOrEqual(200);
  });
});

describe("submit", () => {
  it("stores it (signed in or out), without any token, and notifies the administrator", async () => {
    expect(await submitFeedback(db, "stu", good, mailer, "owner@example.com")).toEqual({ ok: true });
    expect(await submitFeedback(db, null, { ...good, message: "Anonymous idea about notes." }, mailer, "owner@example.com")).toEqual({ ok: true });
    const rows = await db.select().from(feedback);
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("SECRET");
    expect(rows.map((r) => r.pagePath)).toEqual(["/calendar", "/calendar"]);
    expect(rows.map((r) => r.userId).sort()).toEqual([null, "stu"]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ to: "owner@example.com", subject: "Dentiq feedback (bug)" });
    expect(sent[0]!.text).toContain("The calendar page is slow");
  });
  it("is still saved when the notice cannot be sent or no admin address is set", async () => {
    const broken: Mailer = { send: async () => { throw new Error("mail down"); } };
    expect(await submitFeedback(db, "stu", good, broken, "owner@example.com")).toEqual({ ok: true });
    expect(await submitFeedback(db, "stu", good, mailer, undefined)).toEqual({ ok: true });
    expect(await db.select().from(feedback)).toHaveLength(2);
    expect(sent).toHaveLength(0);
  });
  it("saves nothing when invalid", async () => {
    expect(await submitFeedback(db, "stu", { ...good, message: "no" }, mailer, "o@example.com")).toEqual({ ok: false, error: "messageTooShort" });
    expect(await db.select().from(feedback)).toHaveLength(0);
  });
});

describe("administrator", () => {
  it("is the only one who can read and close feedback; closing is audited and reversible", async () => {
    await submitFeedback(db, "stu", good, mailer, undefined);
    expect(await listFeedback(db, student)).toEqual([]);
    const [item] = await listFeedback(db, admin);
    expect(item).toMatchObject({ status: "new", type: "bug" });
    expect(await setFeedbackDone(db, student, item!.id, true)).toBe(false);
    expect(await setFeedbackDone(db, admin, item!.id, true)).toBe(true);
    expect(await listFeedback(db, admin, "new")).toHaveLength(0);
    expect(await listFeedback(db, admin, "all")).toHaveLength(1);
    expect((await listFeedback(db, admin, "all"))[0]).toMatchObject({ status: "done", doneBy: "adm" });
    expect(await setFeedbackDone(db, admin, item!.id, false)).toBe(true);
    expect(await listFeedback(db, admin, "new")).toHaveLength(1);
  });
});

describe("rate limit", () => {
  it("allows a few per hour per visitor and no more, separately for each visitor", async () => {
    const attempt = (who: string) => consumeAttempt(db, rateKey(RATE_FEEDBACK, who), RATE_FEEDBACK.limit, RATE_FEEDBACK.windowSeconds);
    const results = [];
    for (let i = 0; i < RATE_FEEDBACK.limit + 2; i++) results.push((await attempt("stu")).allowed);
    expect(results.filter(Boolean)).toHaveLength(RATE_FEEDBACK.limit);
    expect((await attempt("other")).allowed).toBe(true);
  });
});
