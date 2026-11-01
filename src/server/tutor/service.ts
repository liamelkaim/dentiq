// The tutor's rules. The tutor is OFF unless BOTH are true: an administrator switched the flag on AND a provider is
// configured. No provider exists in this code, so `askTutor` always refuses today, before retrieving anything, recording
// anything or calling anything. What works now is `searchSources`: plain retrieval over the student's authorized sources,
// shown as a search, never as an answer.
//
// Order inside askTutor (each step can stop it; the provider is called last):
//   access -> flag + provider gate -> question check -> course -> daily limit -> retrieval (context budget)
//   -> "no sources" stop -> reserve one unit of today's quota (atomic) -> provider -> citation check
// A provider failure gives the unit back. Nothing in this file calls the network except a provider's own answer().
import { and, count, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, tutorUsage } from "@/db/schema";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { isoDateIn } from "@/server/calendar/dates";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { contextChars } from "./context";
import { QUESTION_MAX_CHARS } from "./constants";
import { citationsAreValid, getTutorProvider, type TutorAnswer, type TutorLocale, type TutorProvider } from "./provider";
import { retrieveSources, type RetrievalInput } from "./retrieval";
import { getTutorSettings, type TutorSettings } from "./settings";
import { cleanQuestion } from "./text";
import type { Passage, RetrievalResult } from "./types";

// ---------- State ----------

/** off: flag off · noProvider: flag on, nothing configured to answer · ready: both. */
export type TutorState = "off" | "noProvider" | "ready";

export type TutorStatus = { state: TutorState; settings: TutorSettings; providerId: string; providerConfigured: boolean };

export async function getTutorStatus(db: Database, provider: TutorProvider = getTutorProvider()): Promise<TutorStatus> {
  const settings = await getTutorSettings(db);
  const providerConfigured = provider.isConfigured();
  const state: TutorState = !settings.enabled ? "off" : !providerConfigured ? "noProvider" : "ready";
  return { state, settings, providerId: provider.id, providerConfigured };
}

/** Cheap check for the navigation: with no provider configured it does not even read the database. */
export async function isTutorReady(db: Database, provider: TutorProvider = getTutorProvider()): Promise<boolean> {
  if (!provider.isConfigured()) return false;
  return (await getTutorSettings(db)).enabled;
}

// ---------- Usage limit ----------

export const usageDay = (now: Date = new Date()) => isoDateIn(now, CALENDAR_TIME_ZONE);

/** Questions this student has sent to a provider today. */
export async function questionsToday(db: Database, userId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tutorUsage)
    .where(and(eq(tutorUsage.userId, userId), eq(tutorUsage.usageDate, usageDay(now))));
  return Number(row?.n ?? 0);
}

/**
 * Take one unit of today's quota, or return null when the limit is reached. The check and the insert run under a
 * per-student advisory lock in one transaction, so two questions sent at the same moment cannot both pass at limit - 1.
 */
export async function reserveQuestion(
  db: Database,
  userId: string,
  input: { limit: number; courseId: string; contextChars: number; passageCount: number; now?: Date },
): Promise<string | null> {
  const date = usageDay(input.now);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tutor:${userId}`}))`);
    const [row] = await tx
      .select({ n: count() })
      .from(tutorUsage)
      .where(and(eq(tutorUsage.userId, userId), eq(tutorUsage.usageDate, date)));
    if (Number(row?.n ?? 0) >= input.limit) return null;
    const [created] = await tx
      .insert(tutorUsage)
      .values({ userId, usageDate: date, courseId: input.courseId, contextChars: input.contextChars, passageCount: input.passageCount })
      .returning({ id: tutorUsage.id });
    return created!.id;
  });
}

async function refundQuestion(db: Database, id: string) {
  await db.delete(tutorUsage).where(eq(tutorUsage.id, id));
}

// ---------- Plain retrieval (works without a provider) ----------

/** Search the student's authorized sources of ONE course. This is a search, not an answer. Any approved member may use it. */
export async function searchSources(db: Database, viewer: Viewer, input: RetrievalInput): Promise<RetrievalResult> {
  return retrieveSources(db, viewer, input);
}

// ---------- Asking the tutor ----------

export type AskInput = { courseId: string; question: string; locale?: TutorLocale; includeHistorical?: boolean; now?: Date };

export type AskResult =
  | { ok: true; kind: "answer"; answer: TutorAnswer; passages: Passage[]; usage: { usedToday: number; dailyLimit: number } }
  /** Nothing in the student's sources matches. The provider is NOT called and no quota is used. */
  | { ok: true; kind: "noSources"; query: string }
  | { ok: false; error: "noAccess" | "off" | "noProvider" | "questionRequired" | "questionTooLong" | "courseNotFound" | "dailyLimit" | "providerFailed" | "badCitations" };

export async function askTutor(db: Database, viewer: Viewer, input: AskInput, provider: TutorProvider = getTutorProvider()): Promise<AskResult> {
  if (!canAccessLibrary(viewer)) return { ok: false, error: "noAccess" };

  // Gate 1 and 2: the flag AND a configured provider. Before anything is read or recorded.
  const status = await getTutorStatus(db, provider);
  if (status.state === "off") return { ok: false, error: "off" };
  if (status.state === "noProvider") return { ok: false, error: "noProvider" };

  const raw = (input.question ?? "").trim();
  if (!raw) return { ok: false, error: "questionRequired" };
  if (raw.length > QUESTION_MAX_CHARS) return { ok: false, error: "questionTooLong" };
  const question = cleanQuestion(raw, QUESTION_MAX_CHARS);

  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId));
  if (!course) return { ok: false, error: "courseNotFound" };

  const { dailyQuestionLimit, maxContextChars } = status.settings;
  if ((await questionsToday(db, viewer.id, input.now)) >= dailyQuestionLimit) return { ok: false, error: "dailyLimit" };

  const locale = input.locale ?? "fr";
  const retrieval = await retrieveSources(db, viewer, {
    courseId: course.id,
    query: question,
    includeHistorical: input.includeHistorical,
    maxContextChars,
    locale,
    now: input.now,
  });
  if (retrieval.passages.length === 0) return { ok: true, kind: "noSources", query: retrieval.query };

  const reservation = await reserveQuestion(db, viewer.id, {
    limit: dailyQuestionLimit,
    courseId: course.id,
    contextChars: contextChars(retrieval.passages),
    passageCount: retrieval.passages.length,
    now: input.now,
  });
  if (!reservation) return { ok: false, error: "dailyLimit" };

  let answer: TutorAnswer;
  try {
    answer = await provider.answer({ question, passages: retrieval.passages, locale });
  } catch {
    await refundQuestion(db, reservation);
    return { ok: false, error: "providerFailed" };
  }
  if (!citationsAreValid(answer, retrieval.passages)) return { ok: false, error: "badCitations" };

  return {
    ok: true,
    kind: "answer",
    answer,
    passages: retrieval.passages,
    usage: { usedToday: await questionsToday(db, viewer.id, input.now), dailyLimit: dailyQuestionLimit },
  };
}
