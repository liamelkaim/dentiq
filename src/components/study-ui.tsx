// Display pieces shared by the study screens. Every answer is shown with an icon AND words, never colour alone.
// A student's proposal is always labelled "not verified"; it is never shown as the truth.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { AttemptOutcome } from "@/db/schema";
import type { Reveal } from "@/server/study/grading";
import type { PublicQuestion } from "@/server/study/questions";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";
import { useTypeName } from "./pass-ui";
import { Badge, cx } from "./ui";

export const letter = (i: number) => String.fromCharCode(65 + i);

export function OutcomeBadge({ outcome }: { outcome: AttemptOutcome | null }) {
  const t = useTranslations("studyTools.outcome");
  if (outcome === null) return <Badge tone="warning">{t("pending")}</Badge>;
  const tone = outcome === "correct" ? "success" : outcome === "incorrect" ? "danger" : outcome === "partial" ? "warning" : "neutral";
  return <Badge tone={tone}>{t(outcome)}</Badge>;
}

/** The question wording, its facts (course, exam year, source) and any images. No answer information. */
export function QuestionBody({ question }: { question: PublicQuestion }) {
  const t = useTranslations("studyTools");
  const typeName = useTypeName();
  const terms = useTranslations("terms");
  const facts = [
    question.courseCode,
    question.examAcademicYear,
    question.examTerm ? terms(question.examTerm) : null,
    typeName(question.questionType),
    question.topic,
  ].filter(Boolean);
  return (
    <div>
      <p className="mb-2 text-[13px] text-text-subtle">{facts.join(" · ")}</p>
      <p className="text-[17px] leading-relaxed break-words whitespace-pre-line">{question.questionText}</p>
      {question.images.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {question.images.map((image, i) => (
            <li key={image.id}>
              <a href={`/api/question-images/${image.id}`} target="_blank" rel="noopener" className="block rounded-[10px] border border-border bg-surface-muted p-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- private image behind an auth check */}
                <img
                  src={`/api/question-images/${image.id}`}
                  alt={image.altText ?? t("imageAlt", { n: i + 1 })}
                  className="mx-auto block max-h-72 w-auto max-w-full rounded-md object-contain"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Verdict({ value, rule }: { value: boolean | null; rule: PublicQuestion["rule"] }) {
  const t = useTranslations("passes.answer");
  if (value === null) return <span className="text-[13px] text-text-subtle">{t("noVerdict")}</span>;
  const label = rule === "perChoice" ? t(value ? "true" : "false") : t(value ? "correct" : "incorrect");
  const Icon = value ? CheckIcon : CloseIcon;
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold", value ? "text-success" : "text-text-muted")}>
      <Icon width={14} height={14} />
      {label}
    </span>
  );
}

/**
 * The answer after answering. Verified: shown as the answer. Proposed: shown ONLY under an "not verified" label
 * with a warning. None: says there is no answer yet.
 */
export function RevealPanel({ reveal, rule, yourChoice }: { reveal: Reveal; rule: PublicQuestion["rule"]; yourChoice?: { selected?: number[]; verdicts?: Record<string, boolean> } }) {
  const t = useTranslations("studyTools.reveal");
  const verified = reveal.basis === "verified";
  const none = reveal.basis === "none";
  return (
    <section
      aria-label={t(verified ? "verifiedTitle" : none ? "noneTitle" : "proposedTitle")}
      className={cx("rounded-[12px] border p-3.5", verified ? "border-success/40 bg-success-soft/40" : "border-border bg-surface-muted/50")}
    >
      <h3 className={cx("mb-2 flex items-center gap-1.5 text-[13px] font-semibold", verified ? "text-success" : "text-text-muted")}>
        {verified ? <CheckIcon width={16} height={16} /> : <InfoIcon width={16} height={16} />}
        {t(verified ? "verifiedTitle" : none ? "noneTitle" : "proposedTitle")}
      </h3>
      {none && <p className="text-[14px] text-text-muted">{t("noneBody")}</p>}
      {!none && rule === "text" && <p className="text-[15px] break-words whitespace-pre-line">{reveal.text}</p>}
      {!none && rule !== "text" && (
        <ol className="flex flex-col divide-y divide-border">
          {reveal.choices.map((c, i) => {
            const mine = yourChoice?.selected?.includes(c.position) || (rule === "perChoice" && yourChoice?.verdicts?.[String(c.position)] !== undefined);
            const myVerdict = yourChoice?.verdicts?.[String(c.position)];
            return (
              <li key={c.position} className="flex items-start gap-3 py-2 text-[14px]">
                <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold text-text-muted">
                  {letter(i)}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {c.text}
                  {mine && yourChoice && (
                    <span className="mt-0.5 block text-[12px] text-text-subtle">
                      {rule === "perChoice" ? t("yourVerdict", { verdict: t(myVerdict ? "trueWord" : "falseWord") }) : t("yourChoice")}
                    </span>
                  )}
                </span>
                <Verdict value={c.correct} rule={rule} />
              </li>
            );
          })}
        </ol>
      )}
      {reveal.basis === "proposed" && (
        <p className="mt-3 flex gap-1.5 text-[12px] text-text-subtle">
          <AlertIcon width={14} height={14} className="mt-px shrink-0" />
          {t("proposedWarning")}
        </p>
      )}
      {reveal.explanation && (
        <div className="mt-3 border-t border-border pt-3">
          <h4 className="text-[13px] font-semibold text-text-subtle">{t("explanation")}</h4>
          <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-line text-text-muted">{reveal.explanation}</p>
        </div>
      )}
    </section>
  );
}

export function PrivacyNote({ children }: { children?: ReactNode }) {
  const t = useTranslations("studyTools");
  return <p className="text-[13px] text-text-subtle">{children ?? t("privacy")}</p>;
}
