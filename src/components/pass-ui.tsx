// Display pieces shared by the Passes screens. Server-compatible (no hooks beyond next-intl's useTranslations).
// "Verified" and "Student proposal" are always shown with an icon AND words, never colour alone.
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AnswerRule } from "@/server/passes/question-types";
import type { getQuestion, QuestionListItem } from "@/server/passes/service";
import { AlertIcon, CheckIcon, CloseIcon, FileIcon, InfoIcon } from "./icons";
import { Badge, cx, ListLinkRow } from "./ui";

export type QuestionDetail = NonNullable<Awaited<ReturnType<typeof getQuestion>>>;

/** Query-string helper: keeps the current filters and changes some of them (empty values are dropped). */
export function hrefWith(base: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}) {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Translated name of a question type; a type removed from the code still shows (read-only). */
export function useTypeName() {
  const t = useTranslations("passes.types");
  return (key: string) => (t.has(`${key}.name`) ? t(`${key}.name`) : t("unknown"));
}

export function AnswerBadge({ status }: { status: "proposed" | "verified" }) {
  const t = useTranslations("passes.answer");
  return status === "verified" ? (
    <Badge tone="success">
      <CheckIcon width={13} height={13} className="mr-1" />
      {t("verifiedBadge")}
    </Badge>
  ) : (
    <Badge>
      <InfoIcon width={13} height={13} className="mr-1" />
      {t("proposedBadge")}
    </Badge>
  );
}

export function ReviewStatusBadge({ status }: { status: "pending" | "published" | "rejected" | "hidden" }) {
  const t = useTranslations("passes.status");
  if (status === "published") return null;
  return <Badge tone={status === "pending" ? "warning" : status === "rejected" ? "danger" : "neutral"}>{t(status)}</Badge>;
}

export function CategoryBadge({ category }: { category: "current" | "previous" }) {
  const t = useTranslations("passes.category");
  return category === "current" ? <Badge tone="accent">{t("current")}</Badge> : null;
}

/** One line of the question text for lists. */
export function excerpt(text: string, max = 160) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function PassRow({ item, courseLabel, offeringHint }: { item: QuestionListItem; courseLabel?: string; offeringHint?: string }) {
  const typeName = useTypeName();
  const terms = useTranslations("terms");
  return (
    <ListLinkRow
      href={`/passes/${item.id}`}
      leading={
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
          <FileIcon width={18} height={18} />
        </span>
      }
      title={excerpt(item.questionText)}
      subtitle={[courseLabel, item.examAcademicYear, item.examTerm ? terms(item.examTerm) : null, typeName(item.questionType), item.topic, offeringHint]
        .filter(Boolean)
        .join(" · ")}
      meta={
        <>
          <AnswerBadge status={item.answerStatus} />
          <ReviewStatusBadge status={item.status} />
          <CategoryBadge category={item.category} />
        </>
      }
    />
  );
}

const letter = (i: number) => String.fromCharCode(65 + i);

/** The question's choices (or statements), without any answer marks, so a student can test themselves first. */
export function ChoiceList({ choices, rule }: { choices: QuestionDetail["choices"]; rule: AnswerRule }) {
  const t = useTranslations("passes.answer");
  if (choices.length === 0) return null;
  return (
    <ol className="mt-4 flex flex-col gap-2" aria-label={t(rule === "perChoice" ? "statements" : "choices")}>
      {choices.map((c, i) => (
        <li key={c.position} className="flex gap-3 rounded-[10px] border border-border px-3 py-2.5 text-[15px]">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold text-text-muted">
            {letter(i)}
          </span>
          <span className="min-w-0 whitespace-pre-line break-words">{c.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Verdict({ value, rule }: { value: boolean | null; rule: AnswerRule }) {
  const t = useTranslations("passes.answer");
  if (value === null) return <span className="text-[13px] text-text-subtle">{t("noVerdict")}</span>;
  const label = rule === "perChoice" ? t(value ? "true" : "false") : t(value ? "correct" : "incorrect");
  const Icon = value ? CheckIcon : CloseIcon;
  return (
    <span className={cx("inline-flex items-center gap-1 text-[13px] font-semibold", value ? "text-success" : "text-text-muted")}>
      <Icon width={14} height={14} />
      {label}
    </span>
  );
}

function VerdictList({ choices, rule, field }: { choices: QuestionDetail["choices"]; rule: AnswerRule; field: "proposedCorrect" | "verifiedCorrect" }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {choices.map((c, i) => (
        <li key={c.position} className="flex items-start gap-3 py-2 text-[14px]">
          <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold text-text-muted">
            {letter(i)}
          </span>
          <span className="min-w-0 flex-1 break-words">{c.text}</span>
          <Verdict value={c[field]} rule={rule} />
        </li>
      ))}
    </ol>
  );
}

/**
 * The answer, collapsed by default. A student's proposal and a moderator-verified answer are two separate
 * blocks with different labels, so a proposal can never be mistaken for a verified answer.
 */
export function AnswerPanel({ question, date }: { question: QuestionDetail; date: (d: Date) => string }) {
  const t = useTranslations("passes.answer");
  const rule = question.type.answer;
  const verified = question.answerStatus === "verified";
  const hasProposal = rule === "text" ? Boolean(question.proposedAnswerText) : question.choices.some((c) => c.proposedCorrect !== null);

  return (
    <details className="group rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-3 text-[15px] font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{t("show")}</span>
        <span className="hidden group-open:inline">{t("hide")}</span>
        <AnswerBadge status={question.answerStatus} />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4">
        <AnswerBlock
          tone="success"
          title={t("verifiedTitle")}
          icon={<CheckIcon width={16} height={16} />}
          empty={!verified ? t("notVerifiedYet") : null}
        >
          {verified && (
            <>
              {rule === "text" ? (
                <p className="text-[15px] whitespace-pre-line">{question.verifiedAnswerText}</p>
              ) : (
                <VerdictList choices={question.choices} rule={rule} field="verifiedCorrect" />
              )}
              {question.verification && (
                <p className="mt-3 text-[13px] text-text-muted">
                  <span className="font-medium">{t("basis")}</span> {question.verification.note ?? t("noBasis")}
                  {question.verification.at && <span className="text-text-subtle"> · {date(question.verification.at)}</span>}
                </p>
              )}
            </>
          )}
        </AnswerBlock>

        <AnswerBlock
          tone="neutral"
          title={t("proposedTitle")}
          icon={<InfoIcon width={16} height={16} />}
          empty={!hasProposal ? t("noProposal") : null}
        >
          {hasProposal &&
            (rule === "text" ? (
              <p className="text-[15px] whitespace-pre-line">{question.proposedAnswerText}</p>
            ) : (
              <VerdictList choices={question.choices} rule={rule} field="proposedCorrect" />
            ))}
          <p className="mt-3 flex gap-1.5 text-[12px] text-text-subtle">
            <AlertIcon width={14} height={14} className="mt-px shrink-0" />
            {t("proposedWarning")}
          </p>
        </AnswerBlock>

        {question.explanation && (
          <div>
            <h3 className="text-[13px] font-semibold text-text-subtle">{t("explanation")}</h3>
            <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line text-text-muted">{question.explanation}</p>
          </div>
        )}
      </div>
    </details>
  );
}

function AnswerBlock({
  tone,
  title,
  icon,
  empty,
  children,
}: {
  tone: "success" | "neutral";
  title: string;
  icon: ReactNode;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section className={cx("rounded-[12px] border p-3.5", tone === "success" ? "border-success/40 bg-success-soft/40" : "border-border bg-surface-muted/50")}>
      <h3 className={cx("mb-2 flex items-center gap-1.5 text-[13px] font-semibold", tone === "success" ? "text-success" : "text-text-muted")}>
        {icon}
        {title}
      </h3>
      {empty ? <p className="text-[14px] text-text-muted">{empty}</p> : null}
      {children}
    </section>
  );
}

/** Link-styled text used for small in-page actions. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
