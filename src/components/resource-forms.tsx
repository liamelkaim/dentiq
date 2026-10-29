"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef } from "react";
import {
  addVersionAction,
  reportResourceAction,
  uploadResourceAction,
  type ResourceFormState,
} from "@/server/resources/actions";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "./ui";

const initial: ResourceFormState = { status: "idle" };

// Mirrors constants in src/db/schema/resources.ts (kept out of the browser bundle).
const kinds = ["outline", "notes", "study_guide", "other"] as const;
const reasons = ["incorrect", "inappropriate", "copyright", "duplicate", "other"] as const;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.pptx";

function useMessage() {
  const t = useTranslations();
  return (key: string | undefined) => (key ? (t.has(key) ? t(key) : key) : undefined);
}

function StateNotice({ state }: { state: ResourceFormState }) {
  const t = useTranslations("resources.form");
  const msg = useMessage();
  if (state.status === "idle" || !state.message) return null;
  return (
    <Notice tone={state.status === "success" ? "success" : "danger"}>
      {msg(state.message)}
      {state.duplicateOf && (
        <>
          {" "}
          <Link href={`/resources/${state.duplicateOf}`} className="font-medium text-accent underline-offset-2 hover:underline">
            {t("seeExisting")}
          </Link>
        </>
      )}
    </Notice>
  );
}

function RightsCheckbox({ id, error }: { id: string; error?: string }) {
  const t = useTranslations("resources.form");
  const msg = useMessage();
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 text-[14px] text-text-muted">
        <input
          id={id}
          name="rightsConfirmed"
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{t("rights")}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-danger">
          {msg(error)}
        </p>
      )}
    </div>
  );
}

function FileField({ id, label, error }: { id: string; label: string; error?: string }) {
  const t = useTranslations("resources.form");
  const msg = useMessage();
  return (
    <Field label={label} htmlFor={id} hint={t("fileHint")} error={msg(error)}>
      <Input
        id={id}
        name="file"
        type="file"
        accept={ACCEPT}
        required
        aria-describedby={`${id}-hint`}
        className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-[13px] file:font-medium file:text-text"
      />
    </Field>
  );
}

export type OfferingOption = { id: string; label: string };

export function UploadResourceForm({
  courseId,
  offerings,
  defaultOfferingId,
  isModerator,
}: {
  courseId: string;
  offerings: OfferingOption[];
  defaultOfferingId: string | null;
  isModerator: boolean;
}) {
  const t = useTranslations("resources");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const [state, action, pending] = useActionState(uploadResourceAction, initial);
  const err = (name: string) => msg(state.fieldErrors?.[name]);

  return (
    <Panel className="p-4 sm:p-6">
      <form action={action} className="flex flex-col gap-5">
        <StateNotice state={state} />
        {!isModerator && <Notice tone="accent">{t("form.reviewNotice")}</Notice>}
        <input type="hidden" name="courseId" value={courseId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.docTitle")} htmlFor={`${p}-title`} error={err("title")} className="sm:col-span-2">
            <Input id={`${p}-title`} name="title" required maxLength={200} />
          </Field>
          <Field label={t("form.kind")} htmlFor={`${p}-kind`}>
            <Select id={`${p}-kind`} name="kind" defaultValue="notes" required>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("form.topic")} htmlFor={`${p}-topic`} hint={t("form.topicHint")} optional={common("optional")}>
            <Input id={`${p}-topic`} name="topic" maxLength={80} aria-describedby={`${p}-topic-hint`} />
          </Field>
          <Field
            label={t("form.offering")}
            htmlFor={`${p}-offering`}
            hint={t("form.offeringHint")}
            error={err("offeringId")}
            className="sm:col-span-2"
          >
            <Select id={`${p}-offering`} name="offeringId" defaultValue={defaultOfferingId ?? ""} aria-describedby={`${p}-offering-hint`}>
              <option value="">{t("form.noOffering")}</option>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("form.description")} htmlFor={`${p}-description`} optional={common("optional")} className="sm:col-span-2">
            <Textarea id={`${p}-description`} name="description" maxLength={2000} />
          </Field>
          <div className="sm:col-span-2">
            <FileField id={`${p}-file`} label={t("form.file")} error={state.fieldErrors?.file} />
          </div>
        </div>

        {isModerator && (
          <label className="flex items-center gap-3 text-[14px]">
            <input name="isOfficial" type="checkbox" className="size-4 accent-[var(--accent)]" />
            {t("form.official")}
          </label>
        )}
        <RightsCheckbox id={`${p}-rights`} error={state.fieldErrors?.rightsConfirmed} />

        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t("form.uploading") : t("form.submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function useResetOnSuccess(state: ResourceFormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  return ref;
}

export function NewVersionForm({ resourceId, isModerator }: { resourceId: string; isModerator: boolean }) {
  const t = useTranslations("resources");
  const common = useTranslations("common");
  const p = useId();
  const [state, action, pending] = useActionState(addVersionAction, initial);
  const ref = useResetOnSuccess(state);
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={ref} action={action} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{t("version.title")}</h3>
        <StateNotice state={state} />
        {!isModerator && <p className="text-[13px] text-text-subtle">{t("version.reviewNotice")}</p>}
        <input type="hidden" name="resourceId" value={resourceId} />
        <FileField id={`${p}-file`} label={t("form.file")} error={state.fieldErrors?.file} />
        <Field label={t("version.changeNote")} htmlFor={`${p}-note`} optional={common("optional")}>
          <Input id={`${p}-note`} name="changeNote" maxLength={300} />
        </Field>
        <RightsCheckbox id={`${p}-rights`} error={state.fieldErrors?.rightsConfirmed} />
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t("form.uploading") : t("version.submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function ReportForm({ resourceId }: { resourceId: string }) {
  const t = useTranslations("resources.report");
  const common = useTranslations("common");
  const p = useId();
  const [state, action, pending] = useActionState(reportResourceAction, initial);
  const ref = useResetOnSuccess(state);
  if (state.status === "success") return <StateNotice state={state} />;
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={ref} action={action} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{t("title")}</h3>
        <StateNotice state={state} />
        <input type="hidden" name="resourceId" value={resourceId} />
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label={t("reason")} htmlFor={`${p}-reason`}>
            <Select id={`${p}-reason`} name="reason" required defaultValue="incorrect">
              {reasons.map((r) => (
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
