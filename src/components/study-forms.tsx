"use client";

// Interactive pieces of the study tools: practice session, flashcard review, quiz taking, personal cards.
// They never decide a rule themselves: scoring, answer visibility and scheduling all happen in the server actions,
// and an answer is only revealed after the action returns it.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { AttemptOutcome, SelfRating } from "@/db/schema";
import {
  answerQuizItemAction,
  createQuizAction,
  deletePersonalCardAction,
  rateQuizItemAction,
  revealAnswerAction,
  reviewCardAction,
  savePersonalCardAction,
  setMarkAction,
  submitAttemptAction,
  type StudyFormState,
} from "@/server/study/actions";
import type { Reveal } from "@/server/study/grading";
import type { PublicQuestion } from "@/server/study/questions";
import { CARD_RATINGS, previewIntervalMinutes, type CardRatingValue } from "@/server/study/schedule";
import type { Marks } from "@/server/study/service";
import { ClockIcon, FlagIcon } from "./icons";
import { QuestionBody, RevealPanel, letter } from "./study-ui";
import { Badge, Button, ButtonLink, Field, Notice, Panel, Select, Textarea, cx } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: StudyFormState = { status: "idle" };

function useErrorText() {
  const t = useTranslations("studyTools.errors");
  return (code: string | undefined) => (code ? (t.has(code) ? t(code) : t("generic")) : undefined);
}

// ---------- Answer fields ----------

export type Draft = { selected: number[]; verdicts: Record<string, boolean>; text: string };
export const emptyDraft: Draft = { selected: [], verdicts: {}, text: "" };

export function draftToResponse(rule: PublicQuestion["rule"], draft: Draft) {
  if (rule === "text") return { text: draft.text };
  if (rule === "perChoice") return { verdicts: draft.verdicts };
  return { selected: draft.selected };
}

/** Choice questions need an answer before they can be checked; an open question may be left empty. */
export function draftIsComplete(question: PublicQuestion, draft: Draft): boolean {
  switch (question.rule) {
    case "single":
      return draft.selected.length === 1;
    case "multiple":
      return draft.selected.length >= 1;
    case "perChoice":
      return question.choices.every((c) => draft.verdicts[String(c.position)] !== undefined);
    case "text":
      return true;
  }
}

const rowClasses =
  "flex min-h-12 cursor-pointer items-start gap-3 rounded-[10px] border border-border px-3 py-2.5 text-[15px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:disabled]:cursor-default";

export function AnswerFields({ question, draft, onChange, disabled }: { question: PublicQuestion; draft: Draft; onChange: (draft: Draft) => void; disabled?: boolean }) {
  const t = useTranslations("studyTools.answerFields");
  const name = `q-${question.id}`;

  if (question.rule === "text") {
    return (
      <Field label={t("writeAnswer")} htmlFor={`${name}-text`} optional={t("optional")} hint={t("writeAnswerHint")}>
        <Textarea id={`${name}-text`} value={draft.text} disabled={disabled} maxLength={4000} onChange={(e) => onChange({ ...draft, text: e.target.value })} className="min-h-28" />
      </Field>
    );
  }

  if (question.rule === "perChoice") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-text-subtle">{t("perChoiceHint")}</p>
        {question.choices.map((c, i) => {
          const key = String(c.position);
          return (
            <fieldset key={c.position} className="rounded-[10px] border border-border px-3 py-2.5">
              <legend className="sr-only">{`${letter(i)}. ${c.text}`}</legend>
              <p className="flex gap-3 text-[15px]">
                <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold text-text-muted">
                  {letter(i)}
                </span>
                <span className="min-w-0 break-words whitespace-pre-line">{c.text}</span>
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([true, false] as const).map((value) => (
                  <label key={String(value)} className={cx(rowClasses, "items-center justify-center py-2")}>
                    <input
                      type="radio"
                      name={`${name}-${key}`}
                      checked={draft.verdicts[key] === value}
                      disabled={disabled}
                      onChange={() => onChange({ ...draft, verdicts: { ...draft.verdicts, [key]: value } })}
                      className="size-4 accent-accent-solid"
                    />
                    {t(value ? "true" : "false")}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    );
  }

  const multiple = question.rule === "multiple";
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] text-text-subtle">{t(multiple ? "multipleHint" : "singleHint")}</legend>
      {question.choices.map((c, i) => (
        <label key={c.position} className={rowClasses}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            checked={draft.selected.includes(c.position)}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...draft,
                selected: multiple ? (e.target.checked ? [...draft.selected, c.position] : draft.selected.filter((p) => p !== c.position)) : [c.position],
              })
            }
            className="mt-0.5 size-4 shrink-0 accent-accent-solid"
          />
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold text-text-muted">
            {letter(i)}
          </span>
          <span className="min-w-0 break-words whitespace-pre-line">{c.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

// ---------- Flag and review later ----------

export function MarkButtons({ questionId, marks, onChange }: { questionId: string; marks: Marks; onChange: (marks: Marks) => void }) {
  const t = useTranslations("studyTools.marks");
  const [pending, startTransition] = useTransition();
  const toggle = (field: "flagged" | "reviewLater") =>
    startTransition(async () => {
      const result = await setMarkAction({ questionId, [field]: !marks[field] });
      if (result.ok) onChange(result.value);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={pending} aria-pressed={marks.flagged} onClick={() => toggle("flagged")}>
        <FlagIcon width={16} height={16} />
        {t(marks.flagged ? "unflag" : "flag")}
      </Button>
      <Button type="button" variant="secondary" size="sm" disabled={pending} aria-pressed={marks.reviewLater} onClick={() => toggle("reviewLater")}>
        <ClockIcon width={16} height={16} />
        {t(marks.reviewLater ? "unreviewLater" : "reviewLater")}
      </Button>
    </div>
  );
}

function OutcomeBanner({ outcome, basis, selfRated }: { outcome: AttemptOutcome; basis: "verified" | "proposed" | "none"; selfRated: boolean }) {
  const t = useTranslations("studyTools.outcome");
  const tone = outcome === "correct" ? "success" : outcome === "incorrect" ? "danger" : outcome === "partial" ? "warning" : "neutral";
  return (
    <Notice tone={tone} title={t(`${outcome}Title`)}>
      {outcome === "unscored" ? t(basis === "none" ? "unscoredNone" : "unscoredProposed") : selfRated ? t("selfRated") : t("scoredAgainstVerified")}
    </Notice>
  );
}

// ---------- Practice ----------

type Done = { outcome: AttemptOutcome; basis: "verified" | "proposed" | "none"; reveal: Reveal; selfRated: boolean; yourChoice: ReturnType<typeof draftToResponse> };

export function PracticeSession({ questions, initialMarks, poolSize }: { questions: PublicQuestion[]; initialMarks: Record<string, Marks>; poolSize: number }) {
  const t = useTranslations("studyTools.practice");
  const errorText = useErrorText();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [revealed, setRevealed] = useState<Reveal | null>(null); // open question: answer shown, waiting for the self-rating
  const [done, setDone] = useState<Done | null>(null);
  const [marks, setMarks] = useState(initialMarks);
  const [tally, setTally] = useState<Record<AttemptOutcome, number>>({ correct: 0, partial: 0, incorrect: 0, unscored: 0 });
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  // Focus: the button that was just pressed disappears with the step, so focus would fall back to the top of the
  // page. After each step it is moved to the new result, to the next question, or to the end summary.
  const questionRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"result" | "question" | null>(null);
  useEffect(() => {
    const want = focusNext.current;
    focusNext.current = null;
    if (want === "result") resultRef.current?.focus();
    else if (want === "question") (questionRef.current ?? endRef.current)?.focus();
  }, [done, revealed, index]);

  const finished = index >= questions.length;
  const question = questions[index];

  if (finished) {
    const scored = tally.correct + tally.partial + tally.incorrect;
    return (
      <Panel className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 ref={endRef} tabIndex={-1} className="text-[20px] font-semibold">
          {t("endTitle")}
        </h2>
        <ul className="flex flex-col gap-1.5 text-[15px]">
          <li>{t("endAnswered", { count: questions.length })}</li>
          <li>{scored > 0 ? t("endScored", { correct: tally.correct, partial: tally.partial, scored }) : t("endNoneScored")}</li>
          {tally.unscored > 0 && <li>{t("endUnscored", { count: tally.unscored })}</li>}
        </ul>
        {tally.unscored > 0 && <p className="text-[13px] text-text-subtle">{t("endUnscoredNote")}</p>}
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/practice/questions">{t("newSession")}</ButtonLink>
          <ButtonLink href="/practice/progress" variant="secondary">
            {t("seeProgress")}
          </ButtonLink>
        </div>
      </Panel>
    );
  }
  if (!question) return null;

  const currentMarks = marks[question.id] ?? { flagged: false, reviewLater: false };

  const record = (selfRating?: SelfRating) => {
    setError(undefined);
    startTransition(async () => {
      const response = { ...draftToResponse(question.rule, draft), ...(selfRating ? { selfRating } : {}) };
      const result = await submitAttemptAction({ questionId: question.id, response });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      focusNext.current = "result";
      setTally((prev) => ({ ...prev, [result.value.outcome]: prev[result.value.outcome] + 1 }));
      setMarks((prev) => ({ ...prev, [question.id]: result.value.marks }));
      setDone({ outcome: result.value.outcome, basis: result.value.answerBasis, reveal: result.value.reveal, selfRated: question.rule === "text", yourChoice: draftToResponse(question.rule, draft) });
    });
  };

  const showAnswer = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await revealAnswerAction(question.id);
      if (result.ok) {
        focusNext.current = "result";
        setRevealed(result.value);
      } else setError(errorText(result.error));
    });
  };

  const next = () => {
    focusNext.current = "question";
    setIndex((i) => i + 1);
    setDraft(emptyDraft);
    setRevealed(null);
    setDone(null);
    setError(undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-medium" aria-live="polite">
          {t("progress", { n: index + 1, total: questions.length })}
        </p>
        <p className="text-[13px] text-text-subtle">{t("poolInfo", { pool: poolSize, shown: questions.length })}</p>
      </div>

      <Panel className="flex flex-col gap-4 p-4 sm:p-6">
        <div ref={questionRef} tabIndex={-1} role="group" aria-label={t("questionRegion")} className="flex flex-col gap-4 outline-offset-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={question.answerStatus === "verified" ? "success" : "neutral"}>{t(question.answerStatus === "verified" ? "badgeVerified" : "badgeProposed")}</Badge>
          </div>
          <QuestionBody question={question} />
        </div>
        {question.answerStatus !== "verified" && <p className="text-[13px] text-text-subtle">{t("notScoredHint")}</p>}

        {!done && !revealed && <AnswerFields question={question} draft={draft} onChange={setDraft} disabled={pending} />}
        {!done && revealed && question.rule === "text" && draft.text.trim() && (
          <div className="rounded-[10px] border border-border bg-surface-muted/50 p-3">
            <p className="text-[13px] font-semibold text-text-subtle">{t("yourAnswer")}</p>
            <p className="mt-1 text-[15px] break-words whitespace-pre-line">{draft.text}</p>
          </div>
        )}

        {error && <Notice tone="danger">{error}</Notice>}

        {!done && !revealed && (
          <div>
            {question.rule === "text" ? (
              <Button type="button" onClick={showAnswer} disabled={pending}>
                {t("showAnswer")}
              </Button>
            ) : (
              <Button type="button" onClick={() => record()} disabled={pending || !draftIsComplete(question, draft)}>
                {t("check")}
              </Button>
            )}
          </div>
        )}

        {!done && revealed && (
          <div ref={resultRef} tabIndex={-1} role="group" aria-label={t("resultRegion")} className="flex flex-col gap-4 outline-offset-4">
            <RevealPanel reveal={revealed} rule={question.rule} />
            <div>
              <p className="mb-2 text-[14px] font-medium">{t(revealed.basis === "verified" ? "ratePrompt" : "rateUnverifiedPrompt")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["got_it", "partly", "missed"] as const).map((rating) => (
                  <Button key={rating} type="button" variant="secondary" disabled={pending} onClick={() => record(rating)}>
                    {t(`rating.${rating}`)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {done && (
          <div ref={resultRef} tabIndex={-1} role="group" aria-label={t("resultRegion")} className="flex flex-col gap-4 outline-offset-4">
            <OutcomeBanner outcome={done.outcome} basis={done.basis} selfRated={done.selfRated} />
            <RevealPanel reveal={done.reveal} rule={question.rule} yourChoice={done.yourChoice} />
            <MarkButtons questionId={question.id} marks={currentMarks} onChange={(m) => setMarks((prev) => ({ ...prev, [question.id]: m }))} />
            <div>
              <Button type="button" onClick={next}>
                {index + 1 >= questions.length ? t("finish") : t("next")}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------- Flashcard review ----------

export type ReviewCard = {
  key: string;
  kind: "question" | "personal";
  id: string;
  box: number;
  front: string;
  back: string;
  images: { id: string; altText: string | null }[];
  /** Question cards only: is the back a verified answer, a proposal, or nothing? */
  basis: "verified" | "proposed" | "none" | null;
};

function intervalLabel(minutes: number, t: ReturnType<typeof useTranslations>) {
  if (minutes < 60) return t("minutes", { count: minutes });
  if (minutes < 24 * 60) return t("hours", { count: Math.round(minutes / 60) });
  return t("days", { count: Math.round(minutes / (24 * 60)) });
}

export function FlashcardReview({ cards }: { cards: ReviewCard[] }) {
  const t = useTranslations("studyTools.flashcards.review");
  const intervals = useTranslations("studyTools.flashcards.interval");
  const errorText = useErrorText();
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [counts, setCounts] = useState<Record<CardRatingValue, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const reviewed = Object.values(counts).reduce((a, b) => a + b, 0);
  const card = queue[0];

  // Focus follows the step: to the back of the card after "Show answer", to the next card (or the end summary) after
  // a rating. The pressed button is gone by then, so focus would otherwise restart at the top of the page.
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"back" | "front" | null>(null);
  useEffect(() => {
    const want = focusNext.current;
    focusNext.current = null;
    if (want === "back") backRef.current?.focus();
    else if (want === "front") (frontRef.current ?? doneRef.current)?.focus();
  }, [flipped, queue]);

  if (!card) {
    return (
      <Panel className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 ref={doneRef} tabIndex={-1} className="text-[20px] font-semibold">
          {t("doneTitle")}
        </h2>
        <p className="text-[15px]">{t("doneBody", { count: reviewed })}</p>
        <ul className="grid grid-cols-2 gap-2 text-[14px] sm:grid-cols-4">
          {CARD_RATINGS.map((r) => (
            <li key={r} className="rounded-[10px] border border-border px-3 py-2">
              <span className="block text-text-subtle">{t(`rating.${r}`)}</span>
              <span className="text-[18px] font-semibold tabular-nums">{counts[r]}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/practice/flashcards">{t("back")}</ButtonLink>
          <ButtonLink href="/practice/progress" variant="secondary">
            {t("seeProgress")}
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  const rate = (rating: CardRatingValue) => {
    setError(undefined);
    startTransition(async () => {
      const result = await reviewCardAction({ kind: card.kind, id: card.id, rating });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
      focusNext.current = "front";
      setFlipped(false);
      // A card you forgot comes back later in this session, at the end of the line.
      setQueue((q) => (rating === "again" ? [...q.slice(1), { ...card, box: result.value.box }] : q.slice(1)));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] font-medium" aria-live="polite">
        {t("progress", { reviewed, left: queue.length })}
      </p>
      <Panel className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{t(card.kind === "personal" ? "personalBadge" : "questionBadge")}</Badge>
          {card.basis === "proposed" && <Badge>{t("proposedBadge")}</Badge>}
          {card.basis === "verified" && <Badge tone="success">{t("verifiedBadge")}</Badge>}
        </div>
        <div ref={frontRef} tabIndex={-1} className="outline-offset-4">
          <h2 className="mb-1 text-[13px] font-semibold text-text-subtle">{t("front")}</h2>
          <p className="text-[17px] leading-relaxed break-words whitespace-pre-line">{card.front}</p>
          {card.images.length > 0 && (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {card.images.map((image, i) => (
                <li key={image.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private image behind an auth check */}
                  <img src={`/api/question-images/${image.id}`} alt={image.altText ?? t("imageAlt", { n: i + 1 })} className="max-h-60 w-auto max-w-full rounded-md border border-border object-contain" />
                </li>
              ))}
            </ul>
          )}
        </div>
        {flipped ? (
          <div ref={backRef} tabIndex={-1} className="border-t border-border pt-4 outline-offset-4">
            <h2 className="mb-1 text-[13px] font-semibold text-text-subtle">{t("back")}</h2>
            <p className="text-[16px] leading-relaxed break-words whitespace-pre-line">{card.back}</p>
          </div>
        ) : null}
        {error && <Notice tone="danger">{error}</Notice>}
        {flipped ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CARD_RATINGS.map((r) => (
              <Button key={r} type="button" variant="secondary" disabled={pending} onClick={() => rate(r)} className="h-auto min-h-14 flex-col gap-0 py-2">
                <span>{t(`rating.${r}`)}</span>
                <span className="text-[12px] font-normal text-text-subtle">{intervalLabel(previewIntervalMinutes(card.box, r), intervals)}</span>
              </Button>
            ))}
          </div>
        ) : (
          <div>
            <Button
              type="button"
              onClick={() => {
                focusNext.current = "back";
                setFlipped(true);
              }}
            >
              {t("showAnswer")}
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------- Personal cards ----------

export function PersonalCardForm({
  courses,
  initial,
}: {
  courses: { id: string; label: string }[];
  initial?: { id: string; front: string; back: string; courseId: string | null };
}) {
  const t = useTranslations("studyTools.flashcards.form");
  const common = useTranslations("common");
  const errorText = useErrorText();
  const { state, pending, onSubmit } = useKeepingForm(savePersonalCardAction, idle);
  return (
    <Panel className="p-4 sm:p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        {state.status === "error" && <Notice tone="danger">{errorText(state.message)}</Notice>}
        <Field label={t("front")} htmlFor="pc-front" error={state.fieldErrors?.front ? errorText(state.fieldErrors.front) : undefined}>
          <Textarea id="pc-front" name="front" required maxLength={4000} defaultValue={initial?.front} aria-invalid={Boolean(state.fieldErrors?.front)} />
        </Field>
        <Field label={t("back")} htmlFor="pc-back" error={state.fieldErrors?.back ? errorText(state.fieldErrors.back) : undefined}>
          <Textarea id="pc-back" name="back" required maxLength={4000} defaultValue={initial?.back} aria-invalid={Boolean(state.fieldErrors?.back)} />
        </Field>
        <Field label={t("course")} htmlFor="pc-course" optional={common("optional")}>
          <Select id="pc-course" name="courseId" defaultValue={initial?.courseId ?? ""}>
            <option value="">{t("noCourse")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-[13px] text-text-subtle">{t("private")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {common("save")}
          </Button>
          <ButtonLink href="/practice/flashcards" variant="ghost">
            {common("cancel")}
          </ButtonLink>
        </div>
      </form>
      {initial && (
        <form action={deletePersonalCardAction} className="mt-5 border-t border-border pt-4">
          <input type="hidden" name="id" value={initial.id} />
          <Button type="submit" variant="danger" size="sm">
            {t("delete")}
          </Button>
        </form>
      )}
    </Panel>
  );
}

// ---------- Quizzes ----------

/** Wraps the scope fields (rendered on the server) in the form that builds a quiz. */
export function QuizForm({ children, defaultCount, maxCount }: { children: ReactNode; defaultCount: number; maxCount: number }) {
  const t = useTranslations("studyTools.quizzes.form");
  const errorText = useErrorText();
  const { state, pending, onSubmit } = useKeepingForm(createQuizAction, idle);
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {state.status === "error" && (
        <Notice tone="danger" className="col-span-2 lg:col-span-4">
          {errorText(state.message)}
        </Notice>
      )}
      {children}
      <Field label={t("count")} htmlFor="quiz-count" hint={t("countHint", { max: maxCount })}>
        <input
          id="quiz-count"
          name="count"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxCount}
          defaultValue={defaultCount}
          className="block h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-[15px] text-text focus:border-accent sm:h-10"
        />
      </Field>
      <div className="col-span-2 flex items-end lg:col-span-4">
        <Button type="submit" disabled={pending}>
          {t("start")}
        </Button>
      </div>
    </form>
  );
}

export function QuizTake({ quizId, items: liveItems, total, answeredBefore: liveAnsweredBefore }: { quizId: string; items: { id: string; question: PublicQuestion }[]; total: number; answeredBefore: number }) {
  const t = useTranslations("studyTools.quizzes.take");
  const errorText = useErrorText();
  const router = useRouter();
  // Saving an answer revalidates the page, so the server sends a shorter "remaining" list while `index`
  // keeps counting. Freeze the list this component started with, or the next question is skipped and the
  // last step renders nothing (found in the browser test, block I).
  const [{ items, answeredBefore }] = useState(() => ({ items: liveItems, answeredBefore: liveAnsweredBefore }));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const item = items[index];
  if (!item) return null;
  const { question } = item;

  const save = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await answerQuizItemAction({ quizId, itemId: item.id, response: draftToResponse(question.rule, draft) });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setDraft(emptyDraft);
      if (result.value.complete || index + 1 >= items.length) router.refresh();
      else setIndex((i) => i + 1);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] font-medium" aria-live="polite">
        {t("progress", { n: answeredBefore + index + 1, total })}
      </p>
      <Panel className="flex flex-col gap-4 p-4 sm:p-6">
        <QuestionBody question={question} />
        <AnswerFields key={item.id} question={question} draft={draft} onChange={setDraft} disabled={pending} />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" onClick={save} disabled={pending || !draftIsComplete(question, draft)}>
            {index + 1 >= items.length ? t("finish") : t("saveNext")}
          </Button>
          <p className="text-[13px] text-text-subtle">{t("noFeedback")}</p>
        </div>
      </Panel>
    </div>
  );
}

/** Self-rating of an open question on the results page (the answer is shown next to it). */
export function QuizRate({ quizId, itemId }: { quizId: string; itemId: string }) {
  const t = useTranslations("studyTools.practice");
  const errorText = useErrorText();
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const rate = (rating: SelfRating) =>
    startTransition(async () => {
      const result = await rateQuizItemAction({ quizId, itemId, rating });
      if (result.ok) router.refresh();
      else setError(errorText(result.error));
    });
  return (
    <div>
      <p className="mb-2 text-[14px] font-medium">{t("ratePrompt")}</p>
      {error && <Notice tone="danger" className="mb-2">{error}</Notice>}
      <div className="grid gap-2 sm:grid-cols-3">
        {(["got_it", "partly", "missed"] as const).map((rating) => (
          <Button key={rating} type="button" variant="secondary" disabled={pending} onClick={() => rate(rating)}>
            {t(`rating.${rating}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

