# Course-grounded AI tutor (Phase 5, grounding layer only)

Status: **the tutor is OFF and has no provider. It is planned, not available.** What exists today is the part that does not need an AI: retrieval over the sources a student may open, source citations, a provider interface with nothing behind it, usage limits, and an honest `/tutor` page. **No answer is generated anywhere. No AI provider, no API key, no AI SDK and no network call exist in this code.**
Built and covered by automated tests (`tests/tutor.test.ts`, `tests/tutor-pure.test.ts`, `tests/tutor-messages.test.ts`); not browser-tested, not committed, not deployed.
Migration: `drizzle/0008_ai_tutor_usage.sql` (1 additive table, `tutor_usage`). Code: `src/server/tutor/*`, `src/components/tutor-{ui,forms}.tsx`, pages `/tutor` and `/admin/tutor`.

## What a student sees

- **Sidebar "AI tutor"** with an "Off" label (it reads "Off" unless the flag is on AND a provider is configured; the second can never be true today). Phones reach it from the Study hub.
- **`/tutor`**: states in French and English that the tutor needs a provider and a budget, that no answers are generated and that nothing typed there is sent anywhere. Below that, **"Search the course sources"**: pick a course (any active course; the sources searched are only those the student may open), type words, get **excerpts with citations**. This is labelled as a search, never as an answer, and nothing is written or summarised.
- **`/admin/tutor`** (administrators): the on/off switch, the daily question limit and the context size. A warning above the switch says that turning it on does nothing without a provider.

## Retrieval: what may be searched

All in `src/server/tutor/retrieval.ts`. It does not decide who may see what; it calls the rules the rest of the app already uses, so it can never show or read more than the student can open.

| Source | Reused rule | What is searched |
| --- | --- | --- |
| Documents | `listResources` (library rules), then **published only** | Title, free-text topic, linked topics and description. **Dentiq does not read inside uploaded files** (PDF/DOCX/PPTX, no extracted text exists in the database, and no PDF-parsing dependency was added), so a document match is flagged "title, topic or description only". If text extraction is ever added, pass it as `extractedText` to `buildDocumentCandidate` and it will be chunked and scored like a note. Shared documents plus the viewer's own private ones. Pending, hidden and removed documents are left out, even the viewer's own |
| Notes | `listNotes` (filters on the owner in SQL) | The viewer's **own** notes only. No one else's, not even a moderator's or administrator's |
| Exam questions | `studyPool` + `loadStudyQuestions` (published, visible, re-checked) | Wording, choices, **verified** answer, explanation. A question whose answer is only a student's proposal is **excluded**. `INCLUDE_UNVERIFIED_ANSWERS` (constants, default `false`) would make proposals retrievable, always labelled "NOT verified" |

Retrieval is scoped to **one selected course**. Unapproved accounts get nothing.

### Ranking
Pure TypeScript, no embeddings, no vector database: text is normalized (lower case, accents removed, œ/æ folded, apostrophes unified), stop words in French and English dropped, simple plural folding, then **BM25** (`src/server/tutor/score.ts`) on title + chunk. Chunks are at most 800 characters with 100 characters of overlap (`chunkText`). Official material gets a x1.25 boost; ties go official, then own, then student. At most 2 passages per source, 6 passages for the current offering, plus up to 3 from previous offerings when requested. The total is cut to a **context budget** (default 6000 characters).

### Current vs previous
Current-offering material (the course's most recent offering, or no offering set; for exam questions, the current academic year) comes first. **Previous offerings are left out by default** (they are counted: "N sources from previous offerings were not searched") and added after the current ones, labelled "may be outdated", only if the student ticks the box.

### Citations
Every passage carries: source type (document, note, exam question), title, course code, academic year and term (or exam year), a link to the page in Dentiq, and one of three origin labels:

| Label | Meaning |
| --- | --- |
| Official course material (professor or school) | A shared document a moderator marked official |
| Student-contributed material | Other shared documents and all exam questions (a moderator verifies an answer, not the source, so questions are not called official) |
| Your own notes / Your own document (private) | The viewer's own notes and private documents |

## Provider interface

`src/server/tutor/provider.ts`:

```ts
interface TutorProvider {
  readonly id: string;
  isConfigured(): boolean;               // must not call the network
  answer({ question, passages, locale }): Promise<{ text; citedPassageIds; usage? }>;
}
```

`NullProvider` (the only one) reports "not configured" and throws if asked to answer. `getTutorProvider()` is the **single** selection point: it reads the `TUTOR_PROVIDER` environment variable and returns a provider only if it is registered in `PROVIDER_FACTORIES`, which is **empty on purpose**. Unknown names, an unset variable and object-prototype names (`toString`) all give the NullProvider.

### The tutor is off unless BOTH hold
1. the administrator flag (`app_settings` key `tutor`, `enabled`, default **false**), AND
2. a provider that `isConfigured()`.

`askTutor` (`service.ts`) checks both before retrieving, recording or calling anything. Order: access, flag and provider, question length, course, daily limit, retrieval, "no sources" stop, reserve quota, provider, citation check. A provider answer that cites a passage it was not given is refused (`citationsAreValid`). If nothing in the student's sources matches, the provider is **not called** and no quota is used: the tutor must say it has no source rather than guess.

## Usage limits (ready for when a provider exists)

| Limit | Default | Bounds | Where |
| --- | --- | --- | --- |
| Questions per student per day (the student's day in `CALENDAR_TIME_ZONE`, America/Toronto) | 10 | 1 to 200 | admin setting, `DEFAULT_DAILY_QUESTION_LIMIT` |
| Characters of sources sent with one question | 6000 | 1000 to 20000 | admin setting, `DEFAULT_MAX_CONTEXT_CHARS` |
| Question length | 500 characters | | `QUESTION_MAX_CHARS` |

The table `tutor_usage` holds one row per question handed to a provider: user, date, course, **counts only** (context characters, passage count). It never stores the question or the passages. The check and the insert run in one transaction under a per-student advisory lock, so simultaneous questions cannot pass the limit (tested with six at once). A provider failure gives the unit back; a refused citation does not (the provider ran). This is all database work: **rate limiting calls nothing external.** Rows are deleted with the account.

## Prompt injection: retrieved text is data

Notes, descriptions and questions are written by people. `wrapPassagesAsData()` (`context.ts`) is what a provider must use to put passages into a prompt: each passage sits between one start and one end marker that only this function can produce (angle brackets, code fences, separator runs and marker words are stripped from the text and the title), every line is prefixed with `| ` so it reads as a quotation, and a preamble says the blocks are data and instructions inside them must never be followed. Tested with forged end markers, fake system lines and a title that tries to close its own block. This reduces the risk; it does not remove it. A real provider also needs a system prompt that refuses instructions found in sources, output limited to cited passages, and evaluation with adversarial notes before it is switched on.

## How a provider would be added (not done; needs owner approval of a provider and a budget)

1. Owner chooses a provider and approves a monthly budget cap and a data-processing position (see privacy below).
2. Add `src/server/tutor/providers/<name>.ts` implementing `TutorProvider`: `isConfigured()` true only when its key/model variables are set; `answer()` builds the prompt from `wrapPassagesAsData(request.passages)`, asks for citations by passage id, returns `citedPassageIds`, and reports token usage. Keep the vendor SDK or HTTP call inside this one file.
3. Register it in `PROVIDER_FACTORIES` (one line), set `TUTOR_PROVIDER=<name>` and the key as a server-side secret in the host (never in the repo, never in a `NEXT_PUBLIC_` variable).
4. Add tests with the provider mocked (no network in the test suite), plus a manual evaluation set of real course questions with expected "no source" cases.
5. Build the question form and answer screen (the `/tutor` page currently shows an honest "configured but no question form yet" notice if a provider appears). The answer screen must show the citations next to the text, the official/student/own labels and the current/previous labels, and a visible "generated, may be wrong" notice.
6. Have an administrator switch the flag on in `/admin/tutor`; set the daily limit and context size deliberately.

## Cost drivers (estimates to plan with, not quotes)

- **Input tokens** per question: the question plus up to the context budget. 6000 characters is roughly 1500 to 2000 tokens. This is the main lever: lower `maxContextChars`.
- **Output tokens** per answer: a few hundred.
- **Volume**: students x questions per day. The daily limit is the cap: at most `students x limit x (input + output)` per day.
- **Model price tier**: usually a larger factor than all of the above.
- No embedding or vector-database cost exists, because retrieval is keyword-based. If keyword search proves too weak (for example for paraphrased questions), embeddings (`pgvector`) would add a one-time indexing cost and a small per-question cost; that is a separate decision.
- Text extraction from uploaded files (if added) is a separate build and, for scanned PDFs, a separate paid or heavy step.

## Privacy: what would leave the server

Today: **nothing**. The search page, retrieval and settings run on Dentiq's own server and database.

If a provider is ever connected, per question: the student's question text and the selected passages (up to the context budget, including excerpts of **the student's own private notes and private documents' titles/topics/descriptions** when they match) would be sent to that provider's servers, which may be outside Canada. Nothing else is sent: no names, emails or account ids, and never other students' private material (retrieval cannot reach it). Consequences to settle before enabling it:

- Law 25 (Québec): the privacy impact assessment must cover the provider, its hosting location, retention, and whether it trains on inputs (choose terms that exclude training and retain as little as possible).
- Students must be told, in French and English, that asking the tutor sends their question and the matched excerpts, including their own notes, to a third party. An opt-in per student is recommended over a global switch alone.
- Student-contributed material (shared documents and exam questions) goes to the provider too; the rights confirmation on uploads does not cover forwarding to an AI service. Review this with the legal questions in `security-privacy.md`.
- Answers are generated text. They can be wrong even with sources. They must never be stored as verified content or fed back into the question bank.

## Not built

- Any provider, any answer, any question form, streaming, chat history, feedback buttons.
- Reading inside PDF/DOCX/PPTX (needs text extraction; none was added).
- Embeddings or semantic search; synonyms; spelling correction beyond accent/plural folding.
- Topic notes of other students, recordings and transcripts (Phase 6).
- Per-course or per-offering tutors tied to a specific professor (retrieval is per course, with current/previous separation by offering).
- Browser-level testing of `/tutor` and `/admin/tutor`.
