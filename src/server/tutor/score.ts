// Keyword ranking (BM25) in plain TypeScript. No database, no network, no embeddings.
// Text and query go through the same normalization (text.ts), so matching ignores case and accents, in French and English.
import { BM25_B, BM25_K1, MIN_TOKEN_LENGTH } from "./constants";
import { tokenize } from "./text";

export type Scorable = { text: string };

export type ScoreOptions = { k1?: number; b?: number };

/**
 * BM25 score of every document for the query, in the same order as `docs`. A document that shares no word with the
 * query scores exactly 0. An empty query (or one made only of stop words) scores everything 0.
 */
export function bm25Scores(query: string, docs: readonly Scorable[], options: ScoreOptions = {}): number[] {
  const k1 = options.k1 ?? BM25_K1;
  const b = options.b ?? BM25_B;
  const queryTerms = [...new Set(tokenize(query, MIN_TOKEN_LENGTH))];
  if (queryTerms.length === 0 || docs.length === 0) return docs.map(() => 0);

  const tokenised = docs.map((d) => tokenize(d.text, MIN_TOKEN_LENGTH));
  const totalLength = tokenised.reduce((sum, tokens) => sum + tokens.length, 0);
  const avgLength = totalLength / docs.length || 1;

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) documentFrequency.set(term, 0);
  const counts = tokenised.map((tokens) => {
    const tf = new Map<string, number>();
    for (const token of tokens) if (documentFrequency.has(token)) tf.set(token, (tf.get(token) ?? 0) + 1);
    for (const term of tf.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    return tf;
  });

  const n = docs.length;
  return counts.map((tf, i) => {
    const length = tokenised[i]!.length;
    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      // The "+1" inside the log keeps the weight positive even for a word that appears in most documents.
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * length) / avgLength)));
    }
    return score;
  });
}
