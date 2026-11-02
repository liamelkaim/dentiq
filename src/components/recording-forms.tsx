"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { makeUploadAction } from "@/lib/upload-client";
import { addNoteAction, updateRecordingSettingsAction, type RecordingActionState } from "@/server/recordings/actions";
import type { RecordingFormState } from "@/server/recordings/upload-handler";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const uploadRecording = makeUploadAction<RecordingFormState>("recording", {
  tooLarge: { status: "error", message: "recordings.errors.fileTooLarge" },
  failed: { status: "error", message: "errors.generic" },
});
const idle: RecordingFormState = { status: "idle" };

export function RecordingUploadForm({ courses, maxMb }: { courses: { id: string; label: string }[]; maxMb: number }) {
  const t = useTranslations("recordings");
  const all = useTranslations();
  const { state, pending, onSubmit } = useKeepingForm(uploadRecording, idle);
  const error = state.status === "error" && state.message ? (all.has(state.message) ? all(state.message) : all("errors.generic")) : null;
  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label={t("form.title")} htmlFor="rec-title">
          <Input id="rec-title" name="title" required maxLength={200} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("form.course")} htmlFor="rec-course" hint={t("form.optional")}>
            <Select id="rec-course" name="courseId" defaultValue="">
              <option value="">{t("form.noCourse")}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("form.lecturer")} htmlFor="rec-lecturer" hint={t("form.optional")}>
            <Input id="rec-lecturer" name="lecturerName" maxLength={120} />
          </Field>
        </div>
        <Field label={t("form.file")} htmlFor="rec-file" hint={t("form.fileHint", { max: maxMb })}>
          <Input id="rec-file" name="file" type="file" required accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.mp4,.wav,.ogg,.webm" />
        </Field>
        <fieldset className="rounded-[10px] border border-border p-4">
          <legend className="px-1 text-[14px] font-semibold">{t("consent.title")}</legend>
          <p className="mb-2 text-[13px] text-text-muted">{t("consent.intro")}</p>
          {(["recordingAllowed", "lecturerPermission", "privateUse"] as const).map((k) => (
            <label key={k} className="flex min-h-11 items-start gap-3 py-2 text-[14px]">
              <input type="checkbox" name={k} required className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
              <span>{t(`consent.${k}`)}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t("form.uploading") : t("form.submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

const noteIdle: RecordingActionState = { status: "idle" };

export function NoteForm({ recordingId }: { recordingId: string }) {
  const t = useTranslations("recordings");
  const all = useTranslations();
  const ref = useRef<HTMLInputElement>(null);
  const { state, pending, onSubmit, formRef } = useKeepingForm(addNoteAction, noteIdle, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="recordingId" value={recordingId} />
      {state.status === "error" && state.message && <Notice tone="danger">{all.has(state.message) ? all(state.message) : all("errors.generic")}</Notice>}
      <Field label={t("notes.body")} htmlFor="note-body">
        <Textarea id="note-body" name="body" rows={3} required maxLength={2000} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("notes.at")} htmlFor="note-at" hint={t("notes.atHint")}>
          <Input id="note-at" name="atSeconds" ref={ref} inputMode="numeric" pattern="[0-9]*" className="w-32" />
        </Field>
        <Button type="button" variant="secondary" onClick={() => {
          const video = document.querySelector<HTMLMediaElement>("[data-recording-player]");
          if (video && ref.current) ref.current.value = String(Math.floor(video.currentTime));
        }}>
          {t("notes.useCurrent")}
        </Button>
        <Button type="submit" disabled={pending}>
          {t("notes.add")}
        </Button>
      </div>
    </form>
  );
}

export function RecordingSettingsForm({ enabled, maxFileMb, quotaMb }: { enabled: boolean; maxFileMb: number; quotaMb: number }) {
  const t = useTranslations("recordings.admin");
  const all = useTranslations();
  const { state, pending, onSubmit } = useKeepingForm(updateRecordingSettingsAction, noteIdle);
  const [on, setOn] = useState(enabled);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {state.status !== "idle" && state.message && <Notice tone={state.status === "success" ? "success" : "danger"}>{all.has(state.message) ? all(state.message) : state.message}</Notice>}
      <Panel className="flex flex-col gap-4 p-4 sm:p-5">
        <label className="flex min-h-11 items-center gap-3 text-[14px]">
          <input type="checkbox" name="enabled" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 shrink-0 accent-[var(--accent)]" />
          <span>{t("enabled")}</span>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("maxFile")} htmlFor="rs-max" hint={t("maxFileHint")}>
            <Input id="rs-max" name="maxFileMb" type="number" inputMode="numeric" min={1} max={500} defaultValue={maxFileMb} required />
          </Field>
          <Field label={t("quota")} htmlFor="rs-quota" hint={t("quotaHint")}>
            <Input id="rs-quota" name="quotaMb" type="number" inputMode="numeric" min={1} max={5120} defaultValue={quotaMb} required />
          </Field>
        </div>
      </Panel>
      <div>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
