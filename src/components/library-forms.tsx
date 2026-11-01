"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { NOTE_BODY_MAX, NOTE_CHANGE_NOTE_MAX, NOTE_TITLE_MAX, TOPIC_NAME_MAX } from "@/server/library/constants";
import {
  addQuestionLinkAction,
  createNoteAction,
  createTopicAction,
  renameTopicAction,
  setTopicsAction,
  updateNoteAction,
  type LibraryFormState,
} from "@/server/library/actions";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const initial: LibraryFormState = { status: "idle" };

function useMessage() {
  const t = useTranslations();
  return (key: string | undefined) => (key ? (t.has(key) ? t(key) : key) : undefined);
}

function StateNotice({ state }: { state: LibraryFormState }) {
  const msg = useMessage();
  if (state.status === "idle" || !state.message) return null;
  return <Notice tone={state.status === "success" ? "success" : "danger"}>{msg(state.message)}</Notice>;
}

export type TopicOption = { id: string; label: string };

/** Tick boxes for a course's topics. Field name `topicIds`. Used inside other forms and on its own. */
export function TopicCheckboxes({ topics, selected = [] }: { topics: TopicOption[]; selected?: string[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      {topics.map((topic) => (
        <li key={topic.id}>
          <label className="flex min-h-11 items-center gap-3 text-[14px]">
            <input type="checkbox" name="topicIds" value={topic.id} defaultChecked={selected.includes(topic.id)} className="size-4 shrink-0 accent-[var(--accent)]" />
            <span className="min-w-0 break-words">{topic.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Why there is nothing to tick, and what to do about it (staff are told where to add topics). */
export function NoTopicsHint({ staffHref }: { staffHref?: string }) {
  const t = useTranslations("library.topics");
  return (
    <p className="text-[14px] text-text-muted">
      {staffHref ? t("pickEmptyStaff") : t("pickEmptyStudent")}
      {staffHref && (
        <>
          {" "}
          <a href={staffHref} className="font-medium text-accent underline-offset-2 hover:underline">
            {t("manage")}
          </a>
        </>
      )}
    </p>
  );
}

// ---------- Topic administration (moderators and admins) ----------

export function CreateTopicForm({ courseId }: { courseId: string }) {
  const t = useTranslations("library.topics");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit, formRef } = useKeepingForm(createTopicAction, initial, { resetOnSuccess: true });
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="text-[15px] font-semibold">{t("add")}</h3>
        <StateNotice state={state} />
        <input type="hidden" name="courseId" value={courseId} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("name")} htmlFor={`${p}-name`} error={msg(state.fieldErrors?.name)}>
            <Input id={`${p}-name`} name="name" required maxLength={TOPIC_NAME_MAX} aria-invalid={state.fieldErrors?.name ? true : undefined} />
          </Field>
          <Field label={t("nameEn")} htmlFor={`${p}-nameEn`} optional={common("optional")} error={msg(state.fieldErrors?.nameEn)}>
            <Input id={`${p}-nameEn`} name="nameEn" maxLength={TOPIC_NAME_MAX} />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {t("addButton")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function RenameTopicForm({ topicId, name, nameEn }: { topicId: string; name: string; nameEn: string | null }) {
  const t = useTranslations("library.topics");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(renameTopicAction, initial);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
      <StateNotice state={state} />
      <input type="hidden" name="topicId" value={topicId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("name")} htmlFor={`${p}-name`} error={msg(state.fieldErrors?.name)}>
          <Input id={`${p}-name`} name="name" defaultValue={name} required maxLength={TOPIC_NAME_MAX} />
        </Field>
        <Field label={t("nameEn")} htmlFor={`${p}-nameEn`} optional={common("optional")}>
          <Input id={`${p}-nameEn`} name="nameEn" defaultValue={nameEn ?? ""} maxLength={TOPIC_NAME_MAX} />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {t("saveName")}
        </Button>
      </div>
    </form>
  );
}

// ---------- Choosing topics for an existing document, note or question ----------

export function TopicPickerForm({
  target,
  id,
  topics,
  selected,
  staffHref,
}: {
  target: "resource" | "note" | "question";
  id: string;
  topics: TopicOption[];
  selected: string[];
  staffHref?: string;
}) {
  const t = useTranslations("library.topics");
  const { state, pending, onSubmit } = useKeepingForm(setTopicsAction, initial);
  if (topics.length === 0) return <NoTopicsHint staffHref={staffHref} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <StateNotice state={state} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-1 text-[13px] text-text-subtle">{t("pickHelp")}</legend>
        <TopicCheckboxes topics={topics} selected={selected} />
      </fieldset>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {t("saveTopics")}
        </Button>
      </div>
    </form>
  );
}

// ---------- Linking a document or note to a published question ----------

export function QuestionLinkForm({ kind, id, questions }: { kind: "resource" | "note"; id: string; questions: { id: string; label: string }[] }) {
  const t = useTranslations("library.links");
  const p = useId();
  const { state, pending, onSubmit, formRef } = useKeepingForm(addQuestionLinkAction, initial, { resetOnSuccess: true });
  if (questions.length === 0) return <p className="text-[14px] text-text-muted">{t("noQuestions")}</p>;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-2">
      <StateNotice state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Field label={t("pickLabel")} htmlFor={`${p}-q`}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select id={`${p}-q`} name="questionId" required defaultValue="" className="min-w-0 sm:flex-1">
            <option value="" disabled>
              {t("pickPlaceholder")}
            </option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {t("add")}
          </Button>
        </div>
      </Field>
    </form>
  );
}

// ---------- Notes ----------

type OfferingChoice = { id: string; label: string };

export function NoteForm(
  props:
    | { mode: "create"; courseId: string; offerings: OfferingChoice[]; topics: TopicOption[]; questionId?: string; staffHref?: string }
    | { mode: "edit"; noteId: string; baseVersion: number; title: string; body: string },
) {
  const t = useTranslations("library.notes");
  const topicsT = useTranslations("library.topics");
  const common = useTranslations("common");
  const msg = useMessage();
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(props.mode === "create" ? createNoteAction : updateNoteAction, initial);
  const err = (name: string) => msg(state.fieldErrors?.[name]);

  return (
    <Panel className="p-4 sm:p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <StateNotice state={state} />
        {props.mode === "create" ? (
          <>
            <Notice tone="accent">{t("privacy")}</Notice>
            <input type="hidden" name="courseId" value={props.courseId} />
            {props.questionId && <input type="hidden" name="questionIds" value={props.questionId} />}
          </>
        ) : (
          <>
            <input type="hidden" name="noteId" value={props.noteId} />
            <input type="hidden" name="baseVersion" value={props.baseVersion} />
          </>
        )}
        <Field label={t("noteTitle")} htmlFor={`${p}-title`} error={err("title")}>
          <Input id={`${p}-title`} name="title" required maxLength={NOTE_TITLE_MAX} defaultValue={props.mode === "edit" ? props.title : ""} aria-invalid={state.fieldErrors?.title ? true : undefined} />
        </Field>
        <Field label={t("body")} htmlFor={`${p}-body`} hint={t("bodyHint", { max: NOTE_BODY_MAX })} error={err("body")}>
          <Textarea
            id={`${p}-body`}
            name="body"
            maxLength={NOTE_BODY_MAX}
            defaultValue={props.mode === "edit" ? props.body : ""}
            className="min-h-72 leading-relaxed"
            aria-describedby={`${p}-body-hint`}
          />
        </Field>
        {props.mode === "create" ? (
          <>
            <Field label={t("offering")} htmlFor={`${p}-offering`} hint={t("offeringHint")} error={err("offeringId")}>
              <Select id={`${p}-offering`} name="offeringId" defaultValue="" aria-describedby={`${p}-offering-hint`}>
                <option value="">{t("noOffering")}</option>
                {props.offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset>
              <legend className="mb-1 text-[13px] font-medium">
                {topicsT("pick")} <span className="font-normal text-text-subtle">({common("optional")})</span>
              </legend>
              {props.topics.length === 0 ? <NoTopicsHint staffHref={props.staffHref} /> : <TopicCheckboxes topics={props.topics} />}
            </fieldset>
          </>
        ) : (
          <Field label={t("changeNote")} htmlFor={`${p}-change`} optional={common("optional")} error={err("changeNote")}>
            <Input id={`${p}-change`} name="changeNote" maxLength={NOTE_CHANGE_NOTE_MAX} />
          </Field>
        )}
        <div>
          <Button type="submit" disabled={pending}>
            {props.mode === "create" ? t("create") : t("saveVersion")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
