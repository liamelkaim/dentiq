// Retrieval over AUTHORIZED course sources only. Nothing here decides who may see what: every source comes through the
// rule the rest of the app already uses, so the tutor can never show or read more than the student can open themselves.
//
//   documents  listResources()                     shared published documents + the viewer's own private ones
//                                                  (pending/hidden/removed are left out even for their owner)
//   notes      listNotes()                         the viewer's OWN notes, never anyone else's
//   questions  studyPool() + loadStudyQuestions()  published questions only; answer must be VERIFIED
//                                                  (unverified only if INCLUDE_UNVERIFIED_ANSWERS says so, always labelled)
//
// Retrieval is scoped to ONE course. Current-offering material comes first; previous offerings only on request.
// This is plain keyword search: it works without any provider and makes no network call.
import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, courseTopics, resources, resourceTopics } from "@/db/schema";
import { listNotes } from "@/server/library/notes";
import { passCategory } from "@/server/passes/academic-year";
import { canAccessLibrary, listResources, type Viewer } from "@/server/resources/service";
import { answerSummary, cardFront, type CardLabels } from "@/server/study/cards";
import { loadStudyQuestions, studyPool } from "@/server/study/questions";
import {
  buildDocumentCandidate,
  buildNoteCandidate,
  buildQuestionCandidate,
  rankCandidates,
  type Candidate,
} from "./candidates";
import { applyContextBudget } from "./context";
import {
  DEFAULT_MAX_CONTEXT_CHARS,
  INCLUDE_UNVERIFIED_ANSWERS,
  NOTE_CANDIDATES_MAX,
  QUESTION_CANDIDATES_MAX,
  QUESTION_MAX_CHARS,
} from "./constants";
import { cleanQuestion } from "./text";
import type { PassageSource, RetrievalResult, SourceOrigin } from "./types";

export type RetrievalInput = {
  courseId: string;
  query: string;
  /** Add passages from previous offerings (after the current ones, labelled). Default false. */
  includeHistorical?: boolean;
  /** Total characters of passage text returned. Default DEFAULT_MAX_CONTEXT_CHARS. */
  maxContextChars?: number;
  /** Label of the wording used inside question passages. Default "fr". */
  locale?: "fr" | "en";
  /** Tests only; the default is the constant INCLUDE_UNVERIFIED_ANSWERS (false). */
  includeUnverified?: boolean;
  now?: Date;
};

const WORDS = {
  fr: { verified: "Réponse vérifiée", proposed: "Réponse proposée, NON vérifiée", explanation: "Explication", trueWord: "Vrai", falseWord: "Faux" },
  en: { verified: "Verified answer", proposed: "Proposed answer, NOT verified", explanation: "Explanation", trueWord: "True", falseWord: "False" },
} as const;

const labelsFor = (locale: "fr" | "en"): CardLabels => ({
  verified: WORDS[locale].verified,
  proposedUnverified: WORDS[locale].proposed,
  noAnswer: "",
  trueWord: WORDS[locale].trueWord,
  falseWord: WORDS[locale].falseWord,
  explanation: WORDS[locale].explanation,
  source: "",
  recalled: "",
  released: "",
});

const EMPTY: RetrievalResult["stats"] = { documents: 0, documentsWithText: 0, notes: 0, questions: 0, historicalSkipped: 0 };

const shorten = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
};

export async function retrieveSources(db: Database, viewer: Viewer, input: RetrievalInput): Promise<RetrievalResult> {
  const query = cleanQuestion(input.query, QUESTION_MAX_CHARS);
  const empty: RetrievalResult = { query, passages: [], stats: { ...EMPTY } };
  if (!query || !canAccessLibrary(viewer)) return empty;

  const [course] = await db.select({ id: courses.id, code: courses.code }).from(courses).where(eq(courses.id, input.courseId));
  if (!course) return empty;

  const locale = input.locale ?? "fr";
  const includeUnverified = input.includeUnverified ?? INCLUDE_UNVERIFIED_ANSWERS;
  const now = input.now ?? new Date();
  const candidates: Candidate[] = [];

  // ---- Documents: the library rule, then published only. Matched on title/topic/description (no extracted text exists).
  const documents = (await listResources(db, viewer, { courseId: course.id, period: "all" })).filter((d) => d.status === "published");
  if (documents.length > 0) {
    const ids = documents.map((d) => d.id);
    const [descriptions, topicRows] = await Promise.all([
      db.select({ id: resources.id, description: resources.description }).from(resources).where(inArray(resources.id, ids)),
      db
        .select({ resourceId: resourceTopics.resourceId, name: courseTopics.name, nameEn: courseTopics.nameEn })
        .from(resourceTopics)
        .innerJoin(courseTopics, eq(resourceTopics.topicId, courseTopics.id))
        .where(inArray(resourceTopics.resourceId, ids)),
    ]);
    const descriptionOf = new Map(descriptions.map((d) => [d.id, d.description]));
    for (const d of documents) {
      const origin: SourceOrigin = d.visibility === "private" ? "own" : d.isOfficial ? "official" : "student";
      candidates.push(
        buildDocumentCandidate(
          {
            type: "document",
            id: d.id,
            title: d.title,
            courseCode: course.code,
            academicYear: d.academicYear,
            term: d.term,
            href: `/resources/${d.id}`,
            origin,
            period: d.period === "historical" ? "historical" : "current",
            detail: d.kind,
            answerStatus: null,
          },
          {
            topic: d.topic,
            linkedTopics: topicRows.filter((t) => t.resourceId === d.id).flatMap((t) => [t.name, t.nameEn ?? ""]),
            description: descriptionOf.get(d.id) ?? null,
          },
        ),
      );
    }
  }

  // ---- Notes: the viewer's own, nobody else's (listNotes filters on the owner in SQL).
  const notes = await listNotes(db, viewer, { courseId: course.id, limit: NOTE_CANDIDATES_MAX });
  for (const n of notes) {
    candidates.push(
      buildNoteCandidate(
        {
          type: "note",
          id: n.id,
          title: n.title,
          courseCode: course.code,
          academicYear: n.academicYear,
          term: n.term,
          href: `/notes/${n.id}`,
          origin: "own",
          period: n.period === "historical" ? "historical" : "current",
          detail: null,
          answerStatus: null,
        },
        n.body,
      ),
    );
  }

  // ---- Questions: published only (studyPool + loadStudyQuestions re-check), verified answers only by default.
  const poolIds = (await studyPool(db, viewer, { course: course.id }, { now })).slice(0, QUESTION_CANDIDATES_MAX);
  const questions = await loadStudyQuestions(db, viewer, poolIds);
  const labels = labelsFor(locale);
  let questionCount = 0;
  for (const q of questions) {
    const verified = answerSummary(q, labels, "verified");
    const proposed = !verified && includeUnverified ? answerSummary(q, labels, "proposed") : null;
    if (verified === null && proposed === null) continue; // no verified answer: not retrievable
    questionCount += 1;
    candidates.push(
      buildQuestionCandidate(
        {
          type: "question",
          id: q.id,
          title: shorten(q.questionText, 80),
          courseCode: course.code,
          academicYear: q.examAcademicYear,
          term: (q.examTerm as PassageSource["term"]) ?? null,
          href: `/passes/${q.id}`,
          origin: "student",
          period: passCategory(q.examAcademicYear, now) === "current" ? "current" : "historical",
          detail: q.provenance,
          answerStatus: verified !== null ? "verified" : "unverified",
        },
        {
          front: cardFront(q),
          answer: verified !== null ? `${WORDS[locale].verified}:\n${verified}` : `${WORDS[locale].proposed}:\n${proposed}`,
          explanation: q.explanation ? `${WORDS[locale].explanation}: ${q.explanation}` : null,
        },
      ),
    );
  }

  const { passages, historicalSkipped } = rankCandidates(query, candidates, { includeHistorical: input.includeHistorical });
  return {
    query,
    passages: applyContextBudget(passages, input.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS),
    stats: {
      documents: documents.length,
      documentsWithText: candidates.filter((c) => c.source.type === "document" && c.basis === "text").length,
      notes: notes.length,
      questions: questionCount,
      historicalSkipped,
    },
  };
}
