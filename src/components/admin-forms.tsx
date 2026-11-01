"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import {
  addOfferingAction,
  createProgramAction,
  importCoursesAction,
  saveCourseAction,
  type FormState,
} from "@/server/catalog/actions";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const initial: FormState = { status: "idle" };

// Mirrors `terms` in src/db/schema/catalog.ts (not imported, to keep the database layer out of the browser bundle).
const terms = ["fall", "winter", "summer"] as const;

type ProgramOption = { id: string; nameFr: string; nameEn: string | null };

/** Translates a "namespace.key" message; leaves unknown keys readable instead of crashing. */
function useMessage() {
  const t = useTranslations();
  return (key: string | undefined) => (key ? (t.has(key) ? t(key) : key) : undefined);
}

function FormStatus({ state }: { state: FormState }) {
  const msg = useMessage();
  if (state.status === "idle" || !state.message) return null;
  return <Notice tone={state.status === "success" ? "success" : "danger"}>{msg(state.message)}</Notice>;
}

function fieldProps(state: FormState, p: string, name: string) {
  const error = state.fieldErrors?.[name];
  const id = `${p}-${name}`;
  return { id, name, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined };
}

type SourceDefaults = { sourceName: string | null; sourceUrl: string | null; sourceRetrievedOn: string | null };

// `p` is a per-form id prefix so several forms can share a page without duplicate ids.
function SourceFields({ p, state, defaults }: { p: string; state: FormState; defaults?: SourceDefaults }) {
  const t = useTranslations("admin.source");
  const msg = useMessage();
  const optional = useTranslations("common")("optional");
  return (
    <fieldset className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
      <legend className="mb-1 text-[13px] font-semibold text-text sm:col-span-3">{t("title")}</legend>
      <p className="-mt-2 text-[13px] text-text-subtle sm:col-span-3">{t("help")}</p>
      <Field label={t("name")} htmlFor={`${p}-sourceName`} optional={optional} error={msg(state.fieldErrors?.sourceName)}>
        <Input {...fieldProps(state, p, "sourceName")} maxLength={200} defaultValue={defaults?.sourceName ?? ""} />
      </Field>
      <Field label={t("url")} htmlFor={`${p}-sourceUrl`} optional={optional} error={msg(state.fieldErrors?.sourceUrl)}>
        <Input {...fieldProps(state, p, "sourceUrl")} type="url" placeholder="https://" defaultValue={defaults?.sourceUrl ?? ""} />
      </Field>
      <Field label={t("retrievedOn")} htmlFor={`${p}-sourceRetrievedOn`} optional={optional} error={msg(state.fieldErrors?.sourceRetrievedOn)}>
        <Input {...fieldProps(state, p, "sourceRetrievedOn")} type="date" defaultValue={defaults?.sourceRetrievedOn ?? ""} />
      </Field>
    </fieldset>
  );
}

function TermSelect({
  p,
  state,
  name,
  defaultValue,
  allowEmpty,
}: {
  p: string;
  state: FormState;
  name: string;
  defaultValue?: string | null;
  allowEmpty?: boolean;
}) {
  const t = useTranslations();
  return (
    <Select {...fieldProps(state, p, name)} defaultValue={defaultValue ?? ""} required={!allowEmpty}>
      {allowEmpty && <option value="">{t("course.notSpecified")}</option>}
      {terms.map((term) => (
        <option key={term} value={term}>
          {t(`terms.${term}`)}
        </option>
      ))}
    </Select>
  );
}

export function ProgramForm() {
  const t = useTranslations("admin.programs");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit, formRef: ref } = useKeepingForm(createProgramAction, initial, { resetOnSuccess: true });
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={ref} onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{t("new")}</h3>
        <FormStatus state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("nameFr")} htmlFor={`${p}-nameFr`} error={msg(state.fieldErrors?.nameFr)}>
            <Input {...fieldProps(state, p, "nameFr")} required maxLength={200} />
          </Field>
          <Field label={t("nameEn")} htmlFor={`${p}-nameEn`} optional={common("optional")}>
            <Input {...fieldProps(state, p, "nameEn")} maxLength={200} />
          </Field>
          <Field label={t("slug")} htmlFor={`${p}-slug`} hint={t("slugHint")} error={msg(state.fieldErrors?.slug)}>
            <Input {...fieldProps(state, p, "slug")} required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </Field>
          <Field label={t("institution")} htmlFor={`${p}-institution`} error={msg(state.fieldErrors?.institution)}>
            <Input {...fieldProps(state, p, "institution")} required maxLength={200} />
          </Field>
        </div>
        <SourceFields p={p} state={state} />
        <div>
          <Button type="submit" disabled={pending}>
            {common("create")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export type CourseFormValues = {
  id: string;
  code: string;
  titleFr: string;
  titleEn: string | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
  credits: string | null;
  yearOfStudy: number | null;
  typicalTerm: string | null;
  programId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceRetrievedOn: string | null;
};

export function CourseForm({ programs, course }: { programs: ProgramOption[]; course?: CourseFormValues }) {
  const t = useTranslations("admin.course");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit, formRef: ref } = useKeepingForm(saveCourseAction, initial, { resetOnSuccess: !course });
  const optional = common("optional");

  return (
    <Panel className="p-4 sm:p-5">
      <form ref={ref} onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{course ? t("edit") : t("new")}</h3>
        <FormStatus state={state} />
        {course && <input type="hidden" name="id" value={course.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("code")} htmlFor={`${p}-code`} error={msg(state.fieldErrors?.code)}>
            <Input {...fieldProps(state, p, "code")} required maxLength={20} defaultValue={course?.code} autoCapitalize="characters" />
          </Field>
          <Field label={t("program")} htmlFor={`${p}-programId`} optional={optional}>
            <Select {...fieldProps(state, p, "programId")} defaultValue={course?.programId ?? ""}>
              <option value="">{common("none")}</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameFr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("titleFr")} htmlFor={`${p}-titleFr`} error={msg(state.fieldErrors?.titleFr)}>
            <Input {...fieldProps(state, p, "titleFr")} required maxLength={200} defaultValue={course?.titleFr} />
          </Field>
          <Field label={t("titleEn")} htmlFor={`${p}-titleEn`} optional={optional}>
            <Input {...fieldProps(state, p, "titleEn")} maxLength={200} defaultValue={course?.titleEn ?? ""} />
          </Field>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label={t("credits")} htmlFor={`${p}-credits`} optional={optional} error={msg(state.fieldErrors?.credits)}>
              <Input {...fieldProps(state, p, "credits")} type="number" min={0} max={99} step={0.5} inputMode="decimal" defaultValue={course?.credits ?? ""} />
            </Field>
            <Field label={t("yearOfStudy")} htmlFor={`${p}-yearOfStudy`} optional={optional} error={msg(state.fieldErrors?.yearOfStudy)}>
              <Input {...fieldProps(state, p, "yearOfStudy")} type="number" min={1} max={8} step={1} inputMode="numeric" defaultValue={course?.yearOfStudy ?? ""} />
            </Field>
            <Field label={t("typicalTerm")} htmlFor={`${p}-typicalTerm`} optional={optional}>
              <TermSelect p={p} state={state} name="typicalTerm" defaultValue={course?.typicalTerm} allowEmpty />
            </Field>
          </div>
          <Field label={t("descriptionFr")} htmlFor={`${p}-descriptionFr`} optional={optional} className="sm:col-span-2">
            <Textarea {...fieldProps(state, p, "descriptionFr")} maxLength={5000} defaultValue={course?.descriptionFr ?? ""} />
          </Field>
          <Field label={t("descriptionEn")} htmlFor={`${p}-descriptionEn`} optional={optional} className="sm:col-span-2">
            <Textarea {...fieldProps(state, p, "descriptionEn")} maxLength={5000} defaultValue={course?.descriptionEn ?? ""} />
          </Field>
        </div>
        <SourceFields p={p} state={state} defaults={course} />
        <div>
          <Button type="submit" disabled={pending}>
            {course ? common("save") : common("create")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function ImportForm({ programs, header }: { programs: ProgramOption[]; header: string }) {
  const t = useTranslations("admin.import");
  const common = useTranslations("common");
  const tCourse = useTranslations("admin.course");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit, formRef: ref } = useKeepingForm(importCoursesAction, initial, { resetOnSuccess: true });
  const summary = state.importSummary;

  return (
    <Panel className="p-4 sm:p-5">
      <form ref={ref} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <h3 className="text-[15px] font-semibold">{t("title")}</h3>
          <p className="mt-1 text-[13px] text-text-subtle">
            {t.rich("help", {
              header,
              code: (chunks) => <code className="rounded bg-surface-muted px-1 py-0.5 text-[12px] break-all text-text-muted">{chunks}</code>,
            })}
          </p>
        </div>
        {state.status === "error" && state.message && <Notice tone="danger">{msg(state.message)}</Notice>}
        {state.status === "success" && summary && (
          <Notice tone="success">{t("result", { created: summary.created, updated: summary.updated })}</Notice>
        )}
        {summary && summary.skipped.length > 0 && (
          <div className="rounded-[var(--radius-control)] border border-border px-4 py-3">
            <p className="text-[13px] font-semibold">{t("errorsTitle")}</p>
            <ul className="mt-1 max-h-40 overflow-auto text-[13px] text-text-muted">
              {summary.skipped.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  {t("line", { line: e.line })} · <code className="text-[12px]">{e.message}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("file")} htmlFor={`${p}-file`}>
            <Input
              id={`${p}-file`}
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-[13px] file:font-medium file:text-text"
            />
          </Field>
          <Field label={tCourse("program")} htmlFor={`${p}-import-programId`} optional={common("optional")}>
            <Select id={`${p}-import-programId`} name="programId" defaultValue="">
              <option value="">{common("none")}</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameFr}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <SourceFields p={p} state={state} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? common("loading") : t("submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function OfferingForm({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  const t = useTranslations("admin.offering");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit, formRef: ref } = useKeepingForm(addOfferingAction, initial, { resetOnSuccess: true });
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={ref} onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{t("add")}</h3>
        <FormStatus state={state} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="courseCode" value={courseCode} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("academicYear")} htmlFor={`${p}-academicYear`} hint={t("academicYearHint")} error={msg(state.fieldErrors?.academicYear)}>
            <Input {...fieldProps(state, p, "academicYear")} required pattern="\d{4}-\d{4}" placeholder="2026-2027" inputMode="numeric" />
          </Field>
          <Field label={t("term")} htmlFor={`${p}-term`}>
            <TermSelect p={p} state={state} name="term" />
          </Field>
          <Field label={t("professors")} htmlFor={`${p}-professorNames`} hint={t("professorsHint")} optional={common("optional")} className="sm:col-span-2">
            <Input {...fieldProps(state, p, "professorNames")} maxLength={1000} />
          </Field>
        </div>
        <SourceFields p={p} state={state} />
        <div>
          <Button type="submit" disabled={pending}>
            {common("create")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
