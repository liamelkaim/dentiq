// Intake step 3: turn the text of an exam paper into question candidates. Format understood (French or English):
//   1. Question text (may span lines)
//   A) first choice      (also "A." or "(A)")
//   B) second choice
//   Réponse : B          (also "Answer:", "Correct:", several letters "A, C")
// The answer found in the file is only ever a PROPOSED answer. Nothing here marks anything as verified.
export type Confidence = "high" | "medium" | "low";

export type QuestionCandidate = {
  number: number;
  type: "sc" | "mc" | "open";
  text: string;
  choices: { label: string; text: string; proposedCorrect: boolean | null }[];
  proposedLetters: string[];
  confidence: Confidence;
  /** Why a person should look at it. Empty when high confidence. */
  flags: string[];
};

const QUESTION_START = /^\s*(\d{1,3})\s*[.)]\s+(\S.*)$/;
const CHOICE = /^\s*\(?([A-Ja-j])[.)]\s+(\S.*)$/;
const ANSWER = /^\s*(?:r[ée]ponses?|answers?|correct(?:e)?s?)\s*[:=]\s*([A-Ja-j](?:\s*(?:,|;|\/|&|et|and)?\s*[A-Ja-j])*)\s*\.?\s*$/i;

export function parseQuestions(text: string): QuestionCandidate[] {
  const out: QuestionCandidate[] = [];
  let cur: { number: number; lines: string[]; choices: { label: string; text: string }[]; answer: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const qText = cur.lines.join(" ").replace(/\s+/g, " ").trim();
    const flags: string[] = [];
    const letters = cur.answer;
    const labels = cur.choices.map((c) => c.label);
    let type: QuestionCandidate["type"] = "open";
    if (cur.choices.length >= 2) type = letters.length > 1 ? "mc" : "sc";
    else if (cur.choices.length === 1) flags.push("oneChoiceOnly");
    if (cur.choices.length > 10) flags.push("tooManyChoices");
    if (type !== "open" && letters.length === 0) flags.push("noAnswerFound");
    if (letters.some((l) => !labels.includes(l))) flags.push("answerNotInChoices");
    if (type === "open" && cur.choices.length === 0) flags.push("noChoices");
    if (qText.length < 15) flags.push("veryShort");
    const dup = labels.length !== new Set(labels).size;
    if (dup) flags.push("duplicateLabels");
    const confidence: Confidence = flags.length === 0 ? "high" : flags.every((f) => f === "noAnswerFound") ? "medium" : "low";
    out.push({
      number: cur.number,
      type,
      text: qText,
      choices: cur.choices.map((c) => ({ ...c, proposedCorrect: letters.length ? letters.includes(c.label) : null })),
      proposedLetters: letters,
      confidence,
      flags,
    });
    cur = null;
  };
  for (const line of text.split("\n")) {
    const answer = ANSWER.exec(line);
    if (answer && cur) {
      cur.answer = [...answer[1]!.toUpperCase().matchAll(/[A-J]/g)].map((m) => m[0]);
      continue;
    }
    const q = QUESTION_START.exec(line);
    // A numbered line inside a question's choices list ("1) ...") would be a new question only when choices exist or none started.
    if (q && (!cur || cur.choices.length > 0 || cur.lines.join(" ").length > 0)) {
      flush();
      cur = { number: Number(q[1]), lines: [q[2]!], choices: [], answer: [] };
      continue;
    }
    const c = CHOICE.exec(line);
    if (c && cur) {
      cur.choices.push({ label: c[1]!.toUpperCase(), text: c[2]!.trim() });
      continue;
    }
    if (cur && line.trim()) {
      if (cur.choices.length > 0) cur.choices[cur.choices.length - 1]!.text += ` ${line.trim()}`;
      else cur.lines.push(line.trim());
    }
  }
  flush();
  return out;
}
