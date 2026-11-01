"use client";

// Forms for exam passes. They keep what you typed when the server reports an error (the form is submitted
// without the automatic reset), show each error next to its field, and never decide a rule themselves: the
// server actions and the pass service hold every rule again.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  editQuestionAction,
  markDuplicateAction,
  reportQuestionAction,
  reviewQuestionAction,
  submitQuestionAction,
  unverifyAnswerAction,
  updatePassSettingsAction,
  verifyAnswerAction,
  type PassFormState,
} from "@/server/passes/actions";
import { QUESTION_TYPES, type AnswerRule } from "@/server/passes/question-types";
import { Button, Field, Input, Notice, Panel, Select, Textarea, cx } from "./ui";

const initial: PassFormState = { status: "idle" };

// Mirror constants in src/db/schema (kept out of the browser bundle).
const terms = ["fall", "winter", "summer"] as const;
const reportReasons = ["wrong_answer", "duplicate", "inappropriate", "leaked_or_copyrighted", "other"] as const;

function useMessage() {
  const t = useTranslations();
  return (key: string | undefined) => (key ? (t.has(key) ? t(key) : key) : undefined);
}

/** Submits through the action without React's automatic form reset, so an error never wipes the form. */
function useKeepingForm(action: (prev: PassFormState, form: FormData) => Promise<PassFormState>) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return { state, pending, onSubmit };
}

function StateNotice({ state }: { state: PassFormState }) {
  const t = useTranslations("passes.form");
  const msg = useMessage();
  if (state.status === "idle" || !state.message) return null;
  return (
    <Notice tone={state.status === "success" ? "success" : "danger"}>
      {msg(state.message)}
      {state.questionId && (
        <>
          {" "}
          <Link href={`/passes/${state.questionId}`} className="font-medium text-accent underline-offset-2 hover:underline">
            {t("seeExisting")}
          </Link>
        </>
      )}
    </Notice>
  );
}

const fieldClasses = "flex flex-col gap-1.5";

function FieldError({ id, error }: { id: string; error?: string }) {
  const msg = useMessage();
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="text-[13px] text-danger">
      {msg(error)}
    </p>
  );
}

// ---------- Question form (new and edit) ----------

type Row = { key: number; text: string; correct: boolean; verdict: "" | "true" | "false" };

export type QuestionFormProps = {
  mode: "new" | "edit";
  courseId: string;
  questionId?: string;
  offerings: { id: string; label: string; academicYear: string }[];
  professors: { id: string; name: string }[];
  recentYears: string[];
  enabledTypes: string[];
  maxImages: number;
  maxImageMB: number;
  isModerator: boolean;
  /** The answer is verified: an edit that changes the content will send it back to "proposed". */
  verified?: boolean;
  cancelHref: string;
  initial?: {
    offeringId: string | null;
    professorId: string | null;
    examAcademicYear: string;
    examTerm: string | null;
    topic: string | null;
    questionType: string;
    questionText: string;
    explanation: string | null;
    provenance: string;
    confidence: string | null;
    choices: { text: string; proposedCorrect: boolean | null }[];
    proposedAnswerText: string | null;
    images: { id: string; altText: string | null; fileName: string }[];
  };
};

function ruleOf(type: string): AnswerRule | null {
  return Object.hasOwn(QUESTION_TYPES, type) ? QUESTION_TYPES[type as keyof typeof QUESTION_TYPES].answer : null;
}

function startingRows(type: string, from?: QuestionFormProps["initial"]): Row[] {
  const def = Object.hasOwn(QUESTION_TYPES, type) ? QUESTION_TYPES[type as keyof typeof QUESTION_TYPES] : null;
  if (!def || def.answer === "text") return [];
  const given = from?.questionType === type ? from.choices : [];
  const count = Math.min(Math.max(given.length, def.choices.min, 4), def.choices.max);
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    text: given[i]?.text ?? "",
    correct: given[i]?.proposedCorrect === true,
    verdict: given[i]?.proposedCorrect === true ? "true" : given[i]?.proposedCorrect === false ? "false" : "",
  }));
}

export function QuestionForm(props: QuestionFormProps) {
  const t = useTranslations("passes");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(props.mode === "new" ? submitQuestionAction : editQuestionAction);
  const err = (name: string) => state.fieldErrors?.[name];
  const init = props.initial;

  const typeOptions = [...new Set([...props.enabledTypes, ...(init ? [init.questionType] : [])])];
  const [type, setType] = useState(init?.questionType ?? props.enabledTypes[0] ?? "sc");
  const rule = ruleOf(type);
  const def = Object.hasOwn(QUESTION_TYPES, type) ? QUESTION_TYPES[type as keyof typeof QUESTION_TYPES] : null;
  const [rows, setRows] = useState<Row[]>(() => startingRows(type, init));
  const [nextKey, setNextKey] = useState(10);

  const yearChoices = [...new Set([...props.recentYears, ...(init ? [init.examAcademicYear] : [])])].sort().reverse();
  const [year, setYear] = useState(init?.examAcademicYear ?? props.recentYears[0] ?? "");
  const [older, setOlder] = useState("");
  const effectiveYear = older.trim() || year;
  const [offeringId, setOfferingId] = useState(init?.offeringId ?? "");
  const visibleOfferings = props.offerings.filter((o) => o.academicYear === effectiveYear);
  const keepOffering = (nextYear: string) => {
    const chosen = props.offerings.find((o) => o.id === offeringId);
    if (chosen && chosen.academicYear !== nextYear) setOfferingId("");
  };

  const activeImages = init?.images ?? [];
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const room = Math.max(props.maxImages - (activeImages.length - removed.size), 0);
  const [slots, setSlots] = useState(1);
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  function changeType(next: string) {
    setType(next);
    const nextDef = Object.hasOwn(QUESTION_TYPES, next) ? QUESTION_TYPES[next as keyof typeof QUESTION_TYPES] : null;
    if (!nextDef || nextDef.answer === "text") {
      setRows([]);
      return;
    }
    // Keep the wording already typed when switching between choice types; answers are cleared.
    const keep = rows.map((r) => ({ ...r, correct: false, verdict: "" as const }));
    const wanted = Math.max(keep.length, nextDef.choices.min, 4);
    const sized = Array.from({ length: Math.min(wanted, nextDef.choices.max) }, (_, i) => keep[i] ?? { key: nextKey + i, text: "", correct: false, verdict: "" as const });
    setNextKey(nextKey + 10);
    setRows(sized);
  }

  const updateRow = (index: number, patch: Partial<Row>) => setRows((all) => all.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const choose = (index: number, checked: boolean) =>
    setRows((all) => all.map((r, i) => (rule === "single" ? { ...r, correct: i === index && checked } : i === index ? { ...r, correct: checked } : r)));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate={false}>
      <StateNotice state={state} />
      {props.mode === "new" && !props.isModerator && <Notice tone="accent">{t("form.reviewNotice")}</Notice>}
      {props.mode === "edit" && props.verified && <Notice tone="warning">{t("form.verifiedEditWarning")}</Notice>}
      {props.mode === "edit" && !props.isModerator && <Notice tone="accent">{t("form.editReviewNotice")}</Notice>}
      <input type="hidden" name={props.mode === "new" ? "courseId" : "questionId"} value={props.mode === "new" ? props.courseId : props.questionId} />

      <Panel className="p-4 sm:p-6">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-[15px] font-semibold">{t("form.originTitle")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("form.examYear")} htmlFor={`${p}-year`} hint={t("form.examYearHint")} error={msg(err("examAcademicYear"))}>
              <Select
                id={`${p}-year`}
                name="examAcademicYear"
                value={year}
                disabled={Boolean(older.trim())}
                onChange={(e) => {
                  setYear(e.target.value);
                  keepOffering(e.target.value);
                }}
                aria-describedby={`${p}-year-hint`}
              >
                {yearChoices.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              {older.trim() && <input type="hidden" name="examAcademicYear" value={year} />}
            </Field>
            <Field label={t("form.olderYear")} htmlFor={`${p}-older`} hint={t("form.olderYearHint")} optional={common("optional")}>
              <Input
                id={`${p}-older`}
                name="examYearOlder"
                value={older}
                inputMode="numeric"
                pattern="\d{4}-\d{4}"
                placeholder="2017-2018"
                maxLength={9}
                onChange={(e) => {
                  setOlder(e.target.value);
                  if (e.target.value.trim()) keepOffering(e.target.value.trim());
                }}
                aria-describedby={`${p}-older-hint`}
              />
            </Field>
            <Field label={t("form.term")} htmlFor={`${p}-term`} optional={common("optional")}>
              <Select id={`${p}-term`} name="examTerm" defaultValue={init?.examTerm ?? ""}>
                <option value="">{t("form.notSpecified")}</option>
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {msg(`terms.${term}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("form.offering")} htmlFor={`${p}-offering`} hint={t("form.offeringHint")} error={msg(err("offeringId"))} optional={common("optional")}>
              <Select id={`${p}-offering`} name="offeringId" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} aria-describedby={`${p}-offering-hint`}>
                <option value="">{t("form.notSpecified")}</option>
                {visibleOfferings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("form.professor")} htmlFor={`${p}-professor`} hint={t("form.professorHint")} error={msg(err("professorId"))} optional={common("optional")} className="sm:col-span-2">
              <Select id={`${p}-professor`} name="professorId" defaultValue={init?.professorId ?? ""} aria-describedby={`${p}-professor-hint`}>
                <option value="">{t("form.notSpecified")}</option>
                {props.professors.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>
      </Panel>

      <Panel className="p-4 sm:p-6">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-[15px] font-semibold">{t("form.questionTitle")}</legend>
          <Field label={t("form.type")} htmlFor={`${p}-type`} error={msg(err("questionType"))}>
            <Select id={`${p}-type`} name="questionType" value={type} onChange={(e) => changeType(e.target.value)} aria-describedby={`${p}-type-hint`}>
              {typeOptions.map((k) => (
                <option key={k} value={k}>
                  {t.has(`types.${k}.name`) ? t(`types.${k}.name`) : t("types.unknown")}
                </option>
              ))}
            </Select>
            <p id={`${p}-type-hint`} className="text-[13px] text-text-subtle">
              {t.has(`types.${type}.description`) ? t(`types.${type}.description`) : ""}
            </p>
          </Field>
          <Field label={t("form.text")} htmlFor={`${p}-text`} error={msg(err("questionText"))}>
            <Textarea id={`${p}-text`} name="questionText" required maxLength={4000} defaultValue={init?.questionText} className="min-h-32" aria-invalid={err("questionText") ? true : undefined} />
          </Field>
          <Field label={t("form.topic")} htmlFor={`${p}-topic`} hint={t("form.topicHint")} optional={common("optional")} error={msg(err("topic"))}>
            <Input id={`${p}-topic`} name="topic" maxLength={80} defaultValue={init?.topic ?? ""} aria-describedby={`${p}-topic-hint`} />
          </Field>
        </fieldset>
      </Panel>

      <Panel className="p-4 sm:p-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[15px] font-semibold">{t("form.imagesTitle")}</legend>
          <p className="text-[13px] text-text-subtle">{t("form.imagesHint", { max: props.maxImages, mb: props.maxImageMB })}</p>
          <FieldError id={`${p}-images`} error={err("images")} />
          {activeImages.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {activeImages.map((image) => {
                const gone = removed.has(image.id);
                return (
                  <li key={image.id} className="flex gap-3 rounded-[10px] border border-border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private image behind an auth check */}
                    <img src={`/api/question-images/${image.id}`} alt={image.altText ?? ""} className={cx("size-16 shrink-0 rounded-md object-cover", gone && "opacity-40")} />
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        name="removeImage"
                        value={image.id}
                        className="size-4 shrink-0 accent-[var(--accent)]"
                        onChange={(e) =>
                          setRemoved((set) => {
                            const next = new Set(set);
                            if (e.target.checked) next.add(image.id);
                            else next.delete(image.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 truncate">{t("form.removeImage", { name: image.fileName })}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {Array.from({ length: Math.min(slots, room) }, (_, i) => (
            <div key={i} className="grid gap-3 rounded-[10px] border border-border p-3 sm:grid-cols-2">
              <Field label={t("form.imageFile", { n: i + 1 })} htmlFor={`${p}-img${i}`}>
                <Input
                  id={`${p}-img${i}`}
                  name={`image${i}`}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-[13px] file:font-medium file:text-text"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.setCustomValidity(file && file.size > props.maxImageMB * 1024 * 1024 ? t("form.imageTooLarge", { mb: props.maxImageMB }) : "");
                    setPicked((all) => ({ ...all, [i]: Boolean(file) }));
                  }}
                />
              </Field>
              <Field label={t("form.imageAlt")} htmlFor={`${p}-alt${i}`} hint={t("form.imageAltHint")}>
                <Input id={`${p}-alt${i}`} name={`imageAlt${i}`} maxLength={300} required={picked[i]} aria-describedby={`${p}-alt${i}-hint`} />
              </Field>
            </div>
          ))}
          {slots < room && (
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setSlots((n) => n + 1)}>
                {t("form.addImage")}
              </Button>
            </div>
          )}
        </fieldset>
      </Panel>

      <Panel className="p-4 sm:p-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[15px] font-semibold">{t(rule === "perChoice" ? "form.statementsTitle" : rule === "text" ? "form.answerTitle" : "form.choicesTitle")}</legend>
          <p className="text-[13px] text-text-subtle">{t(rule === "text" ? "form.answerHint" : "form.choicesHint")}</p>
          <FieldError id={`${p}-choices`} error={err("choices")} />

          {rule === "text" && (
            <Field label={t("form.proposedAnswer")} htmlFor={`${p}-answer`} optional={common("optional")}>
              <Textarea id={`${p}-answer`} name="proposedAnswerText" maxLength={4000} defaultValue={init?.proposedAnswerText ?? ""} />
            </Field>
          )}

          {rule && rule !== "text" && (
            <ol className="flex flex-col gap-3">
              {rows.map((row, i) => (
                <li key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {rule === "single" && (
                      <input
                        type="radio"
                        name="correct"
                        value={i}
                        checked={row.correct}
                        onChange={(e) => choose(i, e.target.checked)}
                        aria-label={t("form.markCorrect", { n: i + 1 })}
                        className="size-5 shrink-0 accent-[var(--accent)]"
                      />
                    )}
                    {rule === "multiple" && (
                      <input
                        type="checkbox"
                        name="correct"
                        value={i}
                        checked={row.correct}
                        onChange={(e) => choose(i, e.target.checked)}
                        aria-label={t("form.markCorrect", { n: i + 1 })}
                        className="size-5 shrink-0 accent-[var(--accent)]"
                      />
                    )}
                    <span aria-hidden="true" className="w-5 shrink-0 text-center text-[13px] font-semibold text-text-subtle">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <Input
                      name="choiceText"
                      value={row.text}
                      maxLength={1000}
                      onChange={(e) => updateRow(i, { text: e.target.value })}
                      aria-label={t(rule === "perChoice" ? "form.statementN" : "form.choiceN", { n: i + 1 })}
                    />
                  </div>
                  {rule === "perChoice" && (
                    <Select
                      name={`correct-${i}`}
                      value={row.verdict}
                      onChange={(e) => updateRow(i, { verdict: e.target.value as Row["verdict"] })}
                      aria-label={t("form.verdictN", { n: i + 1 })}
                      className="sm:w-44"
                    >
                      <option value="">{t("form.dontRemember")}</option>
                      <option value="true">{t("answer.true")}</option>
                      <option value="false">{t("answer.false")}</option>
                    </Select>
                  )}
                  {rule !== "perChoice" && def && rows.length > def.choices.min && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((_, k) => k !== i))} aria-label={t("form.removeChoice", { n: i + 1 })}>
                      {t("form.remove")}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {rule && rule !== "text" && rule !== "perChoice" && def && (
            <div className="flex flex-wrap gap-2">
              {rows.length < def.choices.max && (
                <Button type="button" variant="secondary" size="sm" onClick={() => { setRows((all) => [...all, { key: nextKey, text: "", correct: false, verdict: "" }]); setNextKey(nextKey + 1); }}>
                  {t("form.addChoice")}
                </Button>
              )}
              {rows.some((r) => r.correct) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows((all) => all.map((r) => ({ ...r, correct: false })))}>
                  {t("form.clearAnswer")}
                </Button>
              )}
            </div>
          )}
        </fieldset>
      </Panel>

      <Panel className="p-4 sm:p-6">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-[15px] font-semibold">{t("form.aboutTitle")}</legend>
          {props.mode === "new" && (
            <Field label={t("form.provenance")} htmlFor={`${p}-prov`}>
              <Select id={`${p}-prov`} name="provenance" defaultValue={init?.provenance ?? "recalled"}>
                <option value="recalled">{t("form.provenanceRecalled")}</option>
                <option value="released">{t("form.provenanceReleased")}</option>
              </Select>
            </Field>
          )}
          <Field label={t("form.confidence")} htmlFor={`${p}-conf`} optional={common("optional")}>
            <Select id={`${p}-conf`} name="confidence" defaultValue={init?.confidence ?? ""}>
              <option value="">{t("form.notSpecified")}</option>
              <option value="sure">{t("form.confidenceSure")}</option>
              <option value="unsure">{t("form.confidenceUnsure")}</option>
            </Select>
          </Field>
          <Field label={t("form.explanation")} htmlFor={`${p}-expl`} hint={t("form.explanationHint")} optional={common("optional")}>
            <Textarea id={`${p}-expl`} name="explanation" maxLength={4000} defaultValue={init?.explanation ?? ""} aria-describedby={`${p}-expl-hint`} />
          </Field>
          {props.mode === "edit" && (
            <Field label={t("form.changeNote")} htmlFor={`${p}-change`} optional={common("optional")}>
              <Input id={`${p}-change`} name="changeNote" maxLength={300} />
            </Field>
          )}
        </fieldset>
      </Panel>

      {props.mode === "new" && (
        <div>
          <label htmlFor={`${p}-rights`} className="flex items-start gap-3 text-[14px] text-text-muted">
            <input
              id={`${p}-rights`}
              name="rightsConfirmed"
              type="checkbox"
              required
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              aria-invalid={err("rightsConfirmed") ? true : undefined}
              aria-describedby={err("rightsConfirmed") ? `${p}-rights-error` : undefined}
            />
            <span>{t("form.rights")}</span>
          </label>
          <FieldError id={`${p}-rights`} error={err("rightsConfirmed")} />
          <p className="mt-2 text-[13px] text-text-subtle">{t("form.privacy")}</p>
        </div>
      )}

      <div className="sticky bottom-16 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <Button type="submit" disabled={pending}>
          {pending ? t("form.sending") : t(props.mode === "new" ? "form.submit" : "form.save")}
        </Button>
        <Link href={props.cancelHref} className="inline-flex h-11 items-center px-2 text-[14px] font-medium text-text-muted hover:text-text sm:h-10">
          {common("cancel")}
        </Link>
      </div>
    </form>
  );
}

// ---------- Reports ----------

export function ReportQuestionForm({ questionId }: { questionId: string }) {
  const t = useTranslations("passes.report");
  const common = useTranslations("common");
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(reportQuestionAction);
  if (state.status === "success") return <StateNotice state={state} />;
  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{t("title")}</h3>
        <StateNotice state={state} />
        <input type="hidden" name="questionId" value={questionId} />
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <Field label={t("reason")} htmlFor={`${p}-reason`}>
            <Select id={`${p}-reason`} name="reason" required defaultValue="wrong_answer">
              {reportReasons.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("details")} htmlFor={`${p}-details`} optional={common("optional")}>
            <Input id={`${p}-details`} name="details" maxLength={1000} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ---------- Moderators ----------

export function ReviewForm({ questionId, status }: { questionId: string; status: "pending" | "published" | "rejected" | "hidden" }) {
  const t = useTranslations("passes.review");
  const common = useTranslations("common");
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(reviewQuestionAction);
  const msg = useMessage();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold">{t("title")}</h3>
      <p className="text-[13px] text-text-subtle">{t("current", { status: msg(`passes.status.${status === "published" ? "publishedLabel" : status}`) ?? status })}</p>
      <StateNotice state={state} />
      <input type="hidden" name="questionId" value={questionId} />
      <Field label={t("note")} htmlFor={`${p}-note`} hint={t("noteHint")} optional={common("optional")} error={msg(state.fieldErrors?.note)}>
        <Input id={`${p}-note`} name="note" maxLength={500} aria-describedby={`${p}-note-hint`} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {status !== "published" && (
          <Button type="submit" name="action" value="publish" size="sm" disabled={pending}>
            {t("publish")}
          </Button>
        )}
        {status !== "rejected" && (
          <Button type="submit" name="action" value="reject" variant="danger" size="sm" disabled={pending}>
            {t("reject")}
          </Button>
        )}
        {status !== "hidden" && (
          <Button type="submit" name="action" value="hide" variant="secondary" size="sm" disabled={pending}>
            {t("hide")}
          </Button>
        )}
      </div>
    </form>
  );
}

export type VerifyFormProps = {
  questionId: string;
  rule: AnswerRule;
  choices: { text: string; proposedCorrect: boolean | null; verifiedCorrect: boolean | null }[];
  proposedAnswerText: string | null;
  verifiedAnswerText: string | null;
  verified: boolean;
  requireNote: boolean;
  minNoteLength: number;
};

export function VerifyForm(props: VerifyFormProps) {
  const t = useTranslations("passes.verify");
  const answer = useTranslations("passes.answer");
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(verifyAnswerAction);
  const msg = useMessage();
  // Start from the existing verified answer, or from the student's proposal (which stays visible on the page).
  const start = props.choices.map((c) => (props.verified ? c.verifiedCorrect : c.proposedCorrect));
  const letter = (i: number) => String.fromCharCode(65 + i);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold">{props.verified ? t("titleAgain") : t("title")}</h3>
      <p className="text-[13px] text-text-subtle">{t(props.rule === "text" ? "helpText" : "help")}</p>
      <StateNotice state={state} />
      <input type="hidden" name="questionId" value={props.questionId} />
      <FieldError id={`${p}-choices`} error={state.fieldErrors?.choices} />

      {props.rule === "text" ? (
        <Field label={t("verifiedText")} htmlFor={`${p}-text`}>
          <Textarea id={`${p}-text`} name="verifiedText" maxLength={4000} defaultValue={props.verified ? (props.verifiedAnswerText ?? "") : (props.proposedAnswerText ?? "")} />
        </Field>
      ) : (
        <ol className="flex flex-col gap-2">
          {props.choices.map((c, i) => (
            <li key={i} className={cx(fieldClasses, "rounded-[10px] border border-border p-2.5 sm:flex-row sm:items-center")}>
              <div className="flex min-w-0 flex-1 items-start gap-2 text-[14px]">
                {props.rule !== "perChoice" &&
                  (props.rule === "single" ? (
                    <input type="radio" name="verified" value={i} defaultChecked={start[i] === true} aria-label={t("markCorrect", { n: i + 1 })} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
                  ) : (
                    <input type="checkbox" name="verified" value={i} defaultChecked={start[i] === true} aria-label={t("markCorrect", { n: i + 1 })} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
                  ))}
                <span aria-hidden="true" className="mt-0.5 w-5 shrink-0 text-center text-[13px] font-semibold text-text-subtle">
                  {letter(i)}
                </span>
                <span className="min-w-0 break-words">{c.text}</span>
              </div>
              {props.rule === "perChoice" && (
                <Select name={`verified-${i}`} defaultValue={start[i] === true ? "true" : start[i] === false ? "false" : ""} aria-label={t("verdictN", { n: i + 1 })} className="sm:w-44">
                  <option value="">{t("chooseVerdict")}</option>
                  <option value="true">{answer("true")}</option>
                  <option value="false">{answer("false")}</option>
                </Select>
              )}
            </li>
          ))}
        </ol>
      )}

      <Field
        label={t("note")}
        htmlFor={`${p}-note`}
        hint={t("noteHint", { min: props.minNoteLength })}
        error={msg(state.fieldErrors?.note)}
      >
        <Textarea
          id={`${p}-note`}
          name="note"
          required={props.requireNote}
          minLength={props.requireNote ? props.minNoteLength : undefined}
          maxLength={500}
          className="min-h-20"
          aria-describedby={`${p}-note-hint`}
        />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("saving") : props.verified ? t("submitAgain") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

export function UnverifyForm({ questionId, requireNote, minNoteLength }: { questionId: string; requireNote: boolean; minNoteLength: number }) {
  const t = useTranslations("passes.verify");
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(unverifyAnswerAction);
  const msg = useMessage();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold">{t("removeTitle")}</h3>
      <p className="text-[13px] text-text-subtle">{t("removeHelp")}</p>
      <StateNotice state={state} />
      <input type="hidden" name="questionId" value={questionId} />
      <Field label={t("removeNote")} htmlFor={`${p}-note`} error={msg(state.fieldErrors?.note)} hint={t("removeNoteHint", { min: minNoteLength })}>
        <Input id={`${p}-note`} name="note" required={requireNote} minLength={requireNote ? minNoteLength : undefined} maxLength={500} aria-describedby={`${p}-note-hint`} />
      </Field>
      <div>
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {t("remove")}
        </Button>
      </div>
    </form>
  );
}

/** Group this question under another one with the same wording (or undo the grouping). */
export function GroupButton({ questionId, canonicalId, label, variant = "secondary" }: { questionId: string; canonicalId: string | null; label: string; variant?: "secondary" | "ghost" }) {
  const { state, pending, onSubmit } = useKeepingForm(markDuplicateAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <StateNotice state={state} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="canonicalId" value={canonicalId ?? ""} />
      <div>
        <Button type="submit" variant={variant} size="sm" disabled={pending}>
          {label}
        </Button>
      </div>
    </form>
  );
}

// ---------- Administrators ----------

export type PassSettingsFormProps = {
  types: string[];
  enabledTypes: string[];
  roles: string[];
  allowedRoles: string[];
  requireNote: boolean;
  minNoteLength: number;
  maxImages: number;
  maxImageMB: number;
  maxPending: number;
};

function Check({ children, ...props }: { children: ReactNode } & React.ComponentProps<"input">) {
  return (
    <label className="flex min-h-10 items-center gap-3 text-[14px]">
      <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" {...props} />
      <span>{children}</span>
    </label>
  );
}

export function PassSettingsForm(props: PassSettingsFormProps) {
  const t = useTranslations("passes.settings");
  const types = useTranslations("passes.types");
  const roleNames = useTranslations("roles");
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(updatePassSettingsAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Notice tone="accent">{t("neverChanges")}</Notice>
      <StateNotice state={state} />

      <Panel className="p-4 sm:p-5">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[15px] font-semibold">{t("typesTitle")}</legend>
          <p className="mb-2 text-[13px] text-text-subtle">{t("typesHelp")}</p>
          {props.types.map((k) => (
            <Check key={k} name="questionTypes" value={k} defaultChecked={props.enabledTypes.includes(k)}>
              <span className="font-medium">{types(`${k}.name`)}</span>
              <span className="block text-[13px] text-text-subtle">{types(`${k}.description`)}</span>
            </Check>
          ))}
        </fieldset>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[15px] font-semibold">{t("verifiersTitle")}</legend>
          <p className="mb-2 text-[13px] text-text-subtle">{t("verifiersHelp")}</p>
          {props.roles.map((role) =>
            role === "admin" ? (
              <div key={role}>
                <Check checked disabled readOnly aria-describedby={`${p}-admin`}>
                  {roleNames(role)}
                </Check>
                <input type="hidden" name="verifierRoles" value="admin" />
                <p id={`${p}-admin`} className="ml-7 text-[13px] text-text-subtle">
                  {t("adminAlways")}
                </p>
              </div>
            ) : (
              <Check key={role} name="verifierRoles" value={role} defaultChecked={props.allowedRoles.includes(role)}>
                {roleNames(role)}
              </Check>
            ),
          )}
          <Check name="requireNote" defaultChecked={props.requireNote}>
            {t("requireNote")}
          </Check>
          <Field label={t("minNote")} htmlFor={`${p}-min`} hint={t("minNoteHint")} className="mt-2 sm:max-w-xs">
            <Input id={`${p}-min`} name="minNoteLength" type="number" inputMode="numeric" min={0} max={500} defaultValue={props.minNoteLength} required aria-describedby={`${p}-min-hint`} />
          </Field>
        </fieldset>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-3 text-[15px] font-semibold">{t("limitsTitle")}</legend>
          <Field label={t("maxImages")} htmlFor={`${p}-img`}>
            <Input id={`${p}-img`} name="maxImages" type="number" inputMode="numeric" min={0} max={10} defaultValue={props.maxImages} required />
          </Field>
          <Field label={t("maxImageMB")} htmlFor={`${p}-mb`}>
            <Input id={`${p}-mb`} name="maxImageMB" type="number" inputMode="numeric" min={1} max={10} defaultValue={props.maxImageMB} required />
          </Field>
          <Field label={t("maxPending")} htmlFor={`${p}-pending`} hint={t("maxPendingHint")}>
            <Input id={`${p}-pending`} name="maxPending" type="number" inputMode="numeric" min={1} max={500} defaultValue={props.maxPending} required aria-describedby={`${p}-pending-hint`} />
          </Field>
        </fieldset>
      </Panel>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
