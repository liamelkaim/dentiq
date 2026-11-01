// Pure text helpers for retrieval: normalization (accent-insensitive, FR + EN), tokenization and chunking.
// No database, no network.

/** Common French and English words that carry no meaning for matching. Deliberately short. Written without accents. */
const STOP_WORDS = new Set(
  [
    // French
    "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "et", "ou", "en", "au", "aux", "a", "est", "sont", "ce", "ces", "cet",
    "cette", "qui", "que", "quoi", "dans", "par", "pour", "sur", "avec", "sans", "son", "sa", "ses", "leur", "leurs", "il", "elle",
    "ils", "elles", "on", "se", "si", "ne", "pas", "plus", "comme", "mais", "donc", "ni", "y", "qu", "s", "n", "c", "j", "m", "t",
    "quel", "quelle", "quels", "quelles", "comment", "pourquoi", "quand", "entre", "vers", "chez", "ete", "etre", "avoir", "fait",
    // English
    "the", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with", "without", "is", "are", "was", "were", "be", "been",
    "it", "its", "this", "that", "these", "those", "as", "from", "what", "which", "who", "how", "why", "when", "where", "do", "does",
    "did", "can", "could", "should", "would", "about", "into", "than", "then", "there", "their", "they", "them", "has", "have", "had",
  ],
);

/**
 * Lowercase, remove accents (so "médicament" and "medicament" match), fold ligatures and typographic apostrophes.
 * Letters from other scripts are kept as they are.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[‘’ʼ]/g, "'");
}

/** Light plural folding for FR and EN ("dents" matches "dent", "muscles" matches "muscle"). Never touches short words. */
function foldPlural(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1);
  return word;
}

/**
 * Words of a text, normalized, without stop words. Keeps digits ("2025", "c3") because course material is full of
 * them. Apostrophes split words ("l'email" gives "email").
 */
export function tokenize(input: string, minLength = 2): string[] {
  const words = normalizeText(input).split(/[^\p{L}\p{N}]+/u);
  const out: string[] = [];
  for (const raw of words) {
    if (raw.length < minLength || STOP_WORDS.has(raw)) continue;
    out.push(foldPlural(raw));
  }
  return out;
}

/** The search text as typed: whitespace collapsed, control characters removed, cut to `max` characters. */
export function cleanQuestion(raw: string | undefined | null, max: number): string {
  return (raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export type ChunkOptions = { maxChars: number; overlap: number };

/**
 * Split text into chunks of at most `maxChars`. Paragraphs are kept whole when they fit; a longer paragraph is cut at
 * sentence ends, and a sentence longer than the limit is cut at spaces (or hard cut). Neighbouring chunks of a cut
 * paragraph share up to `overlap` characters so a sentence at a boundary is still found. Empty input gives [].
 */
export function chunkText(text: string, { maxChars, overlap }: ChunkOptions): string[] {
  const max = Math.max(50, Math.floor(maxChars));
  const keep = Math.min(Math.max(0, Math.floor(overlap)), Math.floor(max / 2));
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length <= max) {
      if (current && current.length + 1 + paragraph.length > max) flush();
      current = current ? `${current} ${paragraph}` : paragraph;
      continue;
    }
    flush();
    for (const piece of splitLong(paragraph, max, keep)) chunks.push(piece);
  }
  flush();
  return chunks;
}

/** Cut one long paragraph at sentence ends, then spaces, with `keep` characters of overlap. */
function splitLong(paragraph: string, max: number, keep: number): string[] {
  const sentences = paragraph.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [paragraph];
  const pieces: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
  };
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > max) {
      push();
      current = "";
      pieces.push(...hardSplit(sentence, max, keep));
      continue;
    }
    if (current && current.length + 1 + sentence.length > max) {
      push();
      const tail = keep > 0 ? overlapTail(current, keep) : "";
      current = tail && tail.length + 1 + sentence.length <= max ? `${tail} ${sentence}` : sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  push();
  return pieces;
}

/** The last `keep` characters of `text`, starting at a word boundary. */
function overlapTail(text: string, keep: number): string {
  if (text.length <= keep) return text;
  const tail = text.slice(-keep);
  const space = tail.indexOf(" ");
  return space >= 0 ? tail.slice(space + 1) : "";
}

function hardSplit(sentence: string, max: number, keep: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < sentence.length) {
    let end = Math.min(sentence.length, start + max);
    if (end < sentence.length) {
      const space = sentence.lastIndexOf(" ", end);
      if (space > start + Math.floor(max / 2)) end = space;
    }
    out.push(sentence.slice(start, end).trim());
    if (end >= sentence.length) break;
    let next = end;
    if (keep > 0) {
      // Overlap: begin the next chunk at the first word boundary inside the last `keep` characters.
      const space = sentence.indexOf(" ", end - keep);
      if (space >= 0 && space < end) next = space + 1;
    }
    start = Math.max(next, start + 1);
  }
  return out.filter(Boolean);
}
