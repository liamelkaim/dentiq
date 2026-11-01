// Shapes shared by retrieval, the provider interface, the service and the screens.
import type { Term } from "@/db/schema";

/** Where a passage comes from. */
export type SourceType = "document" | "note" | "question";

/**
 * Who made the material, as far as Dentiq knows it:
 *  - official: a shared document a moderator marked as coming from the professor or the school
 *  - student: material contributed by students (shared documents not marked official, exam questions)
 *  - own: the viewer's own material (their typed notes, their private documents), visible to nobody else
 */
export type SourceOrigin = "official" | "student" | "own";

/** current: the course's most recent offering (or material tied to no offering); historical: an older offering. */
export type SourcePeriod = "current" | "historical";

/** text: matched on text Dentiq holds. metadata: matched on title, topic and description only (no text was extracted). */
export type PassageBasis = "text" | "metadata";

export type PassageSource = {
  type: SourceType;
  id: string;
  title: string;
  courseCode: string;
  /** Offering or exam year the material belongs to, when known. */
  academicYear: string | null;
  term: Term | null;
  /** In-app page of the source. */
  href: string;
  origin: SourceOrigin;
  period: SourcePeriod;
  /** Document kind (outline, notes, ...), exam provenance (recalled, released) or null. */
  detail: string | null;
  /** Exam questions only: whether the answer used is verified. Unverified ones are excluded unless allowed by a constant. */
  answerStatus: "verified" | "unverified" | null;
};

export type Passage = {
  /** Stable within one retrieval: "<type>:<id>#<chunk number>". */
  id: string;
  text: string;
  score: number;
  basis: PassageBasis;
  source: PassageSource;
};

export type RetrievalStats = {
  /** Authorized candidates that were searched, by kind. */
  documents: number;
  /** Documents that have extracted text. Always 0 today: Dentiq does not read inside uploaded files. */
  documentsWithText: number;
  notes: number;
  questions: number;
  /** Candidates from previous offerings that were left out because the student did not ask for them. */
  historicalSkipped: number;
};

export type RetrievalResult = {
  query: string;
  passages: Passage[];
  stats: RetrievalStats;
};
