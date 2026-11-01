// Limits and defaults for the course-grounded tutor, in ONE place. Change a number here and everything follows.
// The tutor itself is OFF: there is no provider in the code. Retrieval (plain search over authorized sources) works
// without one. See docs/ai-tutor.md.

/** app_settings key for the administrator-changeable tutor settings. */
export const TUTOR_SETTINGS_KEY = "tutor";

/** Environment variable that would name a provider. Unset or unknown means "no provider": the tutor stays off. */
export const TUTOR_PROVIDER_ENV = "TUTOR_PROVIDER";

// ---------- Defaults for the administrator settings (each has bounds, see settings.ts) ----------

/** Feature flag default: OFF. */
export const DEFAULT_TUTOR_ENABLED = false;
/** Questions one student may send to a provider per day (their day, in CALENDAR_TIME_ZONE). */
export const DEFAULT_DAILY_QUESTION_LIMIT = 10;
/** Characters of retrieved passages sent with ONE question (the context budget). */
export const DEFAULT_MAX_CONTEXT_CHARS = 6000;

export const DAILY_QUESTION_LIMIT_BOUNDS = [1, 200] as const;
export const MAX_CONTEXT_CHARS_BOUNDS = [1000, 20_000] as const;

// ---------- Retrieval ----------

/** Longest question accepted (characters). */
export const QUESTION_MAX_CHARS = 500;
/** Passages returned for the current offering (and general material), best first. */
export const RETRIEVAL_TOP_K = 6;
/** Extra passages from previous offerings, only when the student asks for them. They come after the current ones. */
export const RETRIEVAL_HISTORICAL_TOP_K = 3;
/** At most this many passages from one source, so a long note cannot fill the whole answer. */
export const MAX_PASSAGES_PER_SOURCE = 2;
/** Characters per chunk when text is split, and the overlap kept between neighbouring chunks. */
export const CHUNK_MAX_CHARS = 800;
export const CHUNK_OVERLAP_CHARS = 100;
/** A passage is cut to fit the budget only if at least this many characters of room remain; otherwise it is skipped. */
export const MIN_PARTIAL_PASSAGE_CHARS = 200;
/** Published questions loaded as candidates per course (newest exam years first). */
export const QUESTION_CANDIDATES_MAX = 500;
/** Own notes loaded as candidates per course (the per-student cap is 500). */
export const NOTE_CANDIDATES_MAX = 500;

/**
 * Questions whose answer is only a student's proposal are NOT retrievable. Setting this to true would make them
 * retrievable, always labelled "unverified". Keep false: a proposal must never ground an answer as if it were fact.
 */
export const INCLUDE_UNVERIFIED_ANSWERS = false;

// ---------- Scoring ----------

/** BM25 parameters (standard values). */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
/** Official course material (marked by a moderator) counts a little more than student-contributed material. */
export const OFFICIAL_BOOST = 1.25;
/** Query words shorter than this are ignored. */
export const MIN_TOKEN_LENGTH = 2;
