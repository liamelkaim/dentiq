"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { askTutorAction, type AskState } from "@/server/tutor/actions";
import { QUESTION_MAX_CHARS } from "@/server/tutor/constants";
import { PassageCard } from "./tutor-ui";
import { Button, Field, Notice, Panel, Select, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: AskState = { status: "idle" };

export function AskForm({ courses, conversationId, defaultCourseId }: { courses: { id: string; label: string }[]; conversationId?: string | null; defaultCourseId?: string }) {
  const t = useTranslations("tutor");
  const all = useTranslations();
  const { state, pending, onSubmit } = useKeepingForm(askTutorAction, idle);
  const origin = (o: string) => (o === "official" ? t("origin.official") : o === "student" ? t("origin.student") : t("origin.ownNote"));
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warning">{t("ask.notClinical")}</Notice>
      <Panel className="p-4 sm:p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {conversationId && <input type="hidden" name="conversationId" value={conversationId} />}
          <Field label={t("search.course")} htmlFor="ask-course">
            <Select id="ask-course" name="courseId" required defaultValue={defaultCourseId ?? ""}>
              <option value="" disabled>
                {t("search.chooseCourse")}
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("ask.question")} htmlFor="ask-q" hint={t("ask.questionHint", { max: QUESTION_MAX_CHARS })}>
            <Textarea id="ask-q" name="question" rows={3} required maxLength={QUESTION_MAX_CHARS} aria-describedby="ask-q-hint" />
          </Field>
          <label className="flex min-h-11 items-start gap-3 text-[14px]">
            <input type="checkbox" name="historical" value="1" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
            <span>{t("search.includeHistorical")}</span>
          </label>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? t("ask.thinking") : t("ask.submit")}
            </Button>
          </div>
        </form>
      </Panel>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state.status === "error" && state.message && <Notice tone="danger">{all.has(state.message) ? all(state.message) : all("errors.generic")}</Notice>}
        {state.status === "noSources" && (
          <Notice tone="accent" title={t("ask.noSourcesTitle")}>
            {t("ask.noSources")}
          </Notice>
        )}
        {state.status === "answer" && (
          <Panel className="flex flex-col gap-3 p-4 sm:p-5">
            <p className="text-[12px] font-semibold text-text-subtle">{t("ask.generated")}</p>
            <p className="text-[16px] leading-relaxed break-words whitespace-pre-line">{state.text}</p>
            <div>
              <p className="mb-1 text-[13px] font-semibold">{t("ask.sources")}</p>
              {state.citations && state.citations.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {state.citations.map((c) => (
                    <li key={c.passageId} className="text-[14px]">
                      <Link href={c.href} className="font-medium text-accent hover:text-accent-hover">
                        {c.title}
                      </Link>{" "}
                      <span className="text-text-subtle">({origin(c.origin)})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-text-muted">{t("ask.noCitations")}</p>
              )}
            </div>
            {state.passages && (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-accent">{t("ask.showPassages", { count: state.passages.length })}</summary>
                <ul className="mt-2 flex flex-col gap-3">
                  {state.passages.map((p) => (
                    <li key={p.id}>
                      <PassageCard passage={p} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {state.usage && <p className="text-[13px] text-text-subtle">{t("ask.usage", { used: state.usage.usedToday, limit: state.usage.dailyLimit })}</p>}
            {state.conversationId && (
              <Link href={`/tutor/history?c=${state.conversationId}`} className="inline-flex min-h-11 items-center text-[14px] font-medium text-accent">
                {t("ask.openConversation")}
              </Link>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
