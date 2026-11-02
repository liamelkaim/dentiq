// The tutor is a study aid, not a clinical tool. A question about a REAL patient (someone the student is treating or
// has seen, not a textbook case) is refused before anything is retrieved or sent anywhere, in French and in English,
// and the student is pointed to their clinical supervisor. This is a heuristic filter: it catches the clear cases
// ("my patient", "mon patient", "should I prescribe", "what dose should I give her") and leaves hypothetical or
// textbook cases ("a 58-year-old patient presents with...") to the normal flow. It is one layer: a real provider also
// needs a system prompt with the same rule, and the screen says plainly that the tutor gives no clinical advice.
const NORM = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");

/** The person is talking about someone in their care right now. */
const REAL_PATIENT = [
  /\b(my|our|this|that|the) (current |own )?patients?\b/,
  /\bi (am|'m|was) (treating|seeing|examining|operating on|working on)\b/,
  /\bi have a patient\b/,
  /\bin clinic (today|this morning|this afternoon)\b/,
  /\b(mon|ma|mes|notre|ce|cette|cet) (patient|patiente|patients|patientes|client|cliente)\b/,
  /\bj'ai (un|une) (patient|patiente)\b/,
  /\bje (traite|vois|examine|opere|suis en train de traiter)\b/,
  /\ben clinique (aujourd'hui|ce matin|cet apres-midi)\b/,
];

/** They ask what to do for that person. */
const ADVICE = [
  /\b(should i|can i|do i|what should i|how (do|should) i|what('s| is) the (best|right)) (prescribe|give|administer|extract|treat|diagnose|inject|anesthetize|operate|refer|stop|start|use|do)\b/,
  /\bwhat (dose|dosage|medication|drug|antibiotic|treatment|diagnosis)\b/,
  /\b(prescribe|dosage|dose|diagnose)\b.*\b(for (him|her|them|my|this)|patient)\b/,
  /\b(dois-je|devrais-je|puis-je|est-ce que je dois|que dois-je|comment dois-je|quel est le meilleur) (prescrire|donner|administrer|extraire|traiter|diagnostiquer|injecter|operer|referer|arreter|commencer|utiliser|faire)\b/,
  /\bquel(le)? (dose|posologie|medicament|antibiotique|traitement|diagnostic)\b/,
  /\b(prescrire|posologie|dose|diagnostiquer)\b.*\b(pour (lui|elle|mon|ma|ce|cette)|patient)\b/,
  /\bemergency|urgence|overdose|surdose|anaphyla|allergic reaction now|reaction allergique en ce moment\b/,
];

export function isRealPatientAdviceRequest(question: string): boolean {
  const q = NORM(question);
  return REAL_PATIENT.some((re) => re.test(q)) && ADVICE.some((re) => re.test(q));
}
