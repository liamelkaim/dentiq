// The tutor's rules. The tutor is OFF unless BOTH are true: an administrator switched the flag on AND a provider is
// configured. No provider exists in this code, so `askTutor` always refuses today, before retrieving anything, recording
// anything or calling anything. What works now is `searchSources`: plain retrieval over the student's authorized sources,
// shown as a search, never as an answer.
//
// Order inside askTutor (each step can stop it; the provider is called last):
//   access -> flag + provider gate -> question check -> real-patient refusal -> consent -> course
//   -> daily limit -> retrieval (context budget) -> "no sources" stop -> reserve today's question/token/cost budget
//   (atomic) -> provider -> citation check -> save the conversation
// A provider failure gives the unit back. Nothing in this file calls the network except a provider's own answer().
import { and, count, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, tutorUsage, type TutorCitation } from "@/db/schema";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { isoDateIn } from "@/server/calendar/dates";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { estimateRequest, costMicros } from "./budget";
import { hasTutorConsent } from "./consent";
import { saveExchange } from "./conversations";
import { isRealPatientAdviceRequest } from "./safety";
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

export type Reservation = { ok: true; id: string } | { ok: false; reason: "dailyLimit" | "tokenLimit" | "costLimit" };

/**
 * Take one unit of today's budget, or say which limit stops it. The checks and the insert run under a per-student
 * advisory lock in one transaction, so two questions sent at the same moment cannot both pass at limit - 1. The row
 * holds the ESTIMATE (cautious) until the provider answers and the real figures replace it.
 */
export async function reserveTutorUnit(
  db: Database,
  userId: string,
  input: {
    limit: number;
    tokenLimit?: number;
    costCapMicros?: number;
    courseId: string;
    contextChars: number;
    passageCount: number;
    estimate?: { inputTokens: number; outputTokens: number; costMicros: number };
    now?: Date;
  },
): Promise<Reservation> {
  const date = usageDay(input.now);
  const est = input.estimate ?? { inputTokens: 0, outputTokens: 0, costMicros: 0 };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tutor:${userId}`}))`);
    const [row] = await tx
      .select({ n: count(), tokens: sql<number>`coalesce(sum(${tutorUsage.inputTokens} + ${tutorUsage.outputTokens}), 0)::float8`, cost: sql<number>`coalesce(sum(${tutorUsage.costMicros}), 0)::float8` })
      .from(tutorUsage)
      .where(and(eq(tutorUsage.userId, userId), eq(tutorUsage.usageDate, date)));
    if (Number(row?.n ?? 0) >= input.limit) return { ok: false as const, reason: "dailyLimit" as const };
    if (input.tokenLimit !== undefined && Number(row?.tokens ?? 0) + est.inputTokens + est.outputTokens > input.tokenLimit) return { ok: false as const, reason: "tokenLimit" as const };
    if (input.costCapMicros !== undefined && Number(row?.cost ?? 0) + est.costMicros > input.costCapMicros) return { ok: false as const, reason: "costLimit" as const };
    const [created] = await tx
      .insert(tutorUsage)
      .values({ userId, usageDate: date, courseId: input.courseId, contextChars: input.contextChars, passageCount: input.passageCount, inputTokens: est.inputTokens, outputTokens: est.outputTokens, costMicros: est.costMicros })
      .returning({ id: tutorUsage.id });
    return { ok: true as const, id: created!.id };
  });
}

/** Question-count limit only (kept for callers and tests that do not use token or cost caps). */
export async function reserveQuestion(
  db: Database,
  userId: string,
  input: { limit: number; courseId: string; contextChars: number; passageCount: number; now?: Date },
): Promise<string | null> {
  const r = await reserveTutorUnit(db, userId, input);
  return r.ok ? r.id : null;
}

async function settleUsage(db: Database, id: string, usage: { inputTokens: number; outputTokens: number; costMicros: number }) {
  await db.update(tutorUsage).set(usage).where(eq(tutorUsage.id, id));
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

export type AskInput = { courseId: string; question: string; locale?: TutorLocale; includeHistorical?: boolean; conversationId?: string | null; now?: Date };

export type AskResult =
  | { ok: true; kind: "answer"; answer: TutorAnswer; passages: Passage[]; conversationId: string | null; usage: { usedToday: number; dailyLimit: number } }
  /** Nothing in the student's sources matches. The provider is NOT called and no quota is used. */
  | { ok: true; kind: "noSources"; query: string }
  | {
      ok: false;
      error: "noAccess" | "off" | "noProvider" | "questionRequired" | "questionTooLong" | "courseNotFound" | "dailyLimit" | "tokenLimit" | "costLimit" | "tooFast" | "consentRequired" | "patientAdvice" | "providerFailed" | "badCitations";
    };

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

  // A question about a real patient is refused before anything is read, recorded or sent.
  if (isRealPatientAdviceRequest(question)) return { ok: false, error: "patientAdvice" };
  // Nothing of the student's content may reach a provider until they accepted the current consent text.
  if (!(await hasTutorConsent(db, viewer.id))) return { ok: false, error: "consentRequired" };
  // (The per-minute abuse limit RATE_TUTOR_ASK is applied by the server action before this function is called.)

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

  const estimate = estimateRequest(provider, question.length, contextChars(retrieval.passages));
  const reservation = await reserveTutorUnit(db, viewer.id, {
    limit: dailyQuestionLimit,
    tokenLimit: status.settings.dailyTokenLimit,
    costCapMicros: status.settings.dailyCostCapMicros,
    courseId: course.id,
    contextChars: contextChars(retrieval.passages),
    passageCount: retrieval.passages.length,
    estimate,
    now: input.now,
  });
  if (!reservation.ok) return { ok: false, error: reservation.reason };

  let answer: TutorAnswer;
  try {
    answer = await provider.answer({ question, passages: retrieval.passages, locale });
  } catch {
    await refundQuestion(db, reservation.id);
    return { ok: false, error: "providerFailed" };
  }
  // The provider's own figures replace the estimate (a provider that does not report usage keeps the cautious estimate).
  const inputTokens = answer.usage?.inputTokens ?? estimate.inputTokens;
  const outputTokens = answer.usage?.outputTokens ?? estimate.outputTokens;
  await settleUsage(db, reservation.id, { inputTokens, outputTokens, costMicros: costMicros(inputTokens, outputTokens, provider.pricing) });
  if (!citationsAreValid(answer, retrieval.passages)) return { ok: false, error: "badCitations" };

  const citations: TutorCitation[] = answer.citedPassageIds.flatMap((id) => {
    const p = retrieval.passages.find((x) => x.id === id);
    return p ? [{ passageId: id, title: p.source.title, href: p.source.href, origin: p.source.origin }] : [];
  });
  const saved = await saveExchange(db, viewer.id, { conversationId: input.conversationId, courseId: course.id, question, answer: answer.text, citations });

  return {
    ok: true,
    kind: "answer",
    answer,
    passages: retrieval.passages,
    conversationId: saved?.conversationId ?? null,
    usage: { usedToday: await questionsToday(db, viewer.id, input.now), dailyLimit: dailyQuestionLimit },
  };
}
