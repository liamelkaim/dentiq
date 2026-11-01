// Turning authorized material into searchable chunks, and ranking them. Pure: the database layer (retrieval.ts) decides
// WHAT may be searched; this file only decides how it is split, scored, ordered and limited.
import {
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  MAX_PASSAGES_PER_SOURCE,
  OFFICIAL_BOOST,
  RETRIEVAL_HISTORICAL_TOP_K,
  RETRIEVAL_TOP_K,
} from "./constants";
import { bm25Scores } from "./score";
import { chunkText } from "./text";
import type { Passage, PassageBasis, PassageSource, SourceOrigin } from "./types";

export type Candidate = {
  source: PassageSource;
  basis: PassageBasis;
  /** Pieces of text a passage can be. Scored together with the title. */
  chunks: string[];
};

export type RankOptions = {
  /** Add passages from previous offerings after the current ones. Default false: the two are not mixed. */
  includeHistorical?: boolean;
  topK?: number;
  historicalTopK?: number;
  perSource?: number;
};

const originRank: Record<SourceOrigin, number> = { official: 0, own: 1, student: 2 };

const key = (s: Pick<PassageSource, "type" | "id">) => `${s.type}:${s.id}`;

/**
 * A document. Dentiq does not read inside uploaded files, so unless `extractedText` is given (nothing provides it
 * today) the document is matched on its title, topic, linked topics and description only, flagged basis "metadata".
 * The title is part of the text so a document with nothing but a title can still be found by it.
 */
export function buildDocumentCandidate(
  source: PassageSource,
  input: { topic: string | null; linkedTopics: readonly string[]; description: string | null; extractedText?: string | null },
): Candidate {
  const text = input.extractedText?.trim();
  if (text) return { source, basis: "text", chunks: chunkText(text, { maxChars: CHUNK_MAX_CHARS, overlap: CHUNK_OVERLAP_CHARS }) };
  const parts = [source.title, input.topic, ...input.linkedTopics, input.description].map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  const unique = [...new Set(parts)];
  return { source, basis: "metadata", chunks: unique.length ? [unique.join("\n")] : [] };
}

/** A typed note: its body split into chunks. */
export function buildNoteCandidate(source: PassageSource, body: string): Candidate {
  return { source, basis: "text", chunks: chunkText(body, { maxChars: CHUNK_MAX_CHARS, overlap: CHUNK_OVERLAP_CHARS }) };
}

/** An exam question with the answer line (already labelled by the caller) and the explanation. */
export function buildQuestionCandidate(source: PassageSource, parts: { front: string; answer: string; explanation: string | null }): Candidate {
  const text = [parts.front, parts.answer, parts.explanation].filter((p): p is string => Boolean(p && p.trim())).join("\n\n");
  return { source, basis: "text", chunks: chunkText(text, { maxChars: CHUNK_MAX_CHARS, overlap: CHUNK_OVERLAP_CHARS }) };
}

/**
 * Rank every chunk of every candidate against the query (BM25 on title + chunk, accent-insensitive), best first.
 * - A chunk that shares no word with the query is never returned.
 * - Official material is boosted a little (OFFICIAL_BOOST); ties go to official, then own, then student material.
 * - At most `perSource` chunks per source.
 * - Current-offering (and general) passages come first. Previous-offering passages are returned only when
 *   `includeHistorical` is true, after the current ones, and are counted in `historicalSkipped` when left out.
 */
export function rankCandidates(query: string, candidates: readonly Candidate[], options: RankOptions = {}): { passages: Passage[]; historicalSkipped: number } {
  const topK = options.topK ?? RETRIEVAL_TOP_K;
  const historicalTopK = options.historicalTopK ?? RETRIEVAL_HISTORICAL_TOP_K;
  const perSource = options.perSource ?? MAX_PASSAGES_PER_SOURCE;

  const pool = options.includeHistorical ? candidates : candidates.filter((c) => c.source.period !== "historical");
  const historicalSkipped = options.includeHistorical
    ? 0
    : new Set(candidates.filter((c) => c.source.period === "historical" && c.chunks.length > 0).map((c) => key(c.source))).size;

  const entries = pool.flatMap((candidate) => candidate.chunks.map((text, index) => ({ candidate, text, index })));
  const scores = bm25Scores(
    query,
    entries.map((e) => ({ text: `${e.candidate.source.title}\n${e.text}` })),
  );

  const scored = entries
    .map((e, i) => ({ ...e, score: scores[i]! * (e.candidate.source.origin === "official" ? OFFICIAL_BOOST : 1), order: i }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || originRank[a.candidate.source.origin] - originRank[b.candidate.source.origin] || a.order - b.order);

  const take = (period: "current" | "historical", limit: number): Passage[] => {
    const perKey = new Map<string, number>();
    const out: Passage[] = [];
    for (const e of scored) {
      if (e.candidate.source.period !== period) continue;
      const k = key(e.candidate.source);
      const used = perKey.get(k) ?? 0;
      if (used >= perSource) continue;
      perKey.set(k, used + 1);
      out.push({ id: `${k}#${e.index + 1}`, text: e.text, score: e.score, basis: e.candidate.basis, source: e.candidate.source });
      if (out.length >= limit) break;
    }
    return out;
  };

  const passages = [...take("current", topK), ...(options.includeHistorical ? take("historical", historicalTopK) : [])];
  return { passages, historicalSkipped };
}
