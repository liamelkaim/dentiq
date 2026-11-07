"use client";

import { useTranslations } from "next-intl";
import { addClassBlockAction, importIcsAction, type ScheduleFormState } from "@/server/calendar/schedule-actions";
import { Button, Field, Input, Notice, Panel, Select } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: ScheduleFormState = { status: "idle" };

export function ClassBlockForm({ courses, defaultFrom, defaultTo }: { courses: { id: string; label: string }[]; defaultFrom: string; defaultTo: string }) {
  const t = useTranslations("schedule");
  const cal = useTranslations("calendar");
  const { state, pending, onSubmit, formRef } = useKeepingForm(addClassBlockAction, idle, { resetOnSuccess: true });
  const err = state.status === "error" ? (cal.has(`errors.${state.message}`) ? cal(`errors.${state.message}`) : t.has(`errors.${state.message}`) ? t(`errors.${state.message}`) : cal("errors.invalid")) : null;
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && <Notice tone="danger" className="sm:col-span-2">{err}</Notice>}
        {state.status === "success" && <Notice tone="success" className="sm:col-span-2">{t("saved")}</Notice>}
        <Field label={t("form.title")} htmlFor="blk-title" className="sm:col-span-2">
          <Input id="blk-title" name="title" required maxLength={120} />
        </Field>
        <Field label={t("form.course")} htmlFor="blk-course" hint={t("form.courseHint")}>
          <Select id="blk-course" name="courseId" defaultValue="">
            <option value="">{t("form.noCourse")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("form.weekday")} htmlFor="blk-weekday">
          <Select id="blk-weekday" name="weekday" defaultValue="1">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {t(`weekdays.${d}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("form.start")} htmlFor="blk-start">
          <Input id="blk-start" name="startTime" type="time" required />
        </Field>
        <Field label={t("form.end")} htmlFor="blk-end">
          <Input id="blk-end" name="endTime" type="time" required />
        </Field>
        <Field label={t("form.from")} htmlFor="blk-from">
          <Input id="blk-from" name="validFrom" type="date" required defaultValue={defaultFrom} />
        </Field>
        <Field label={t("form.to")} htmlFor="blk-to">
          <Input id="blk-to" name="validTo" type="date" required defaultValue={defaultTo} />
        </Field>
        <Field label={t("form.location")} htmlFor="blk-loc" className="sm:col-span-2">
          <Input id="blk-loc" name="location" maxLength={120} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {t("form.add")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function IcsImportForm() {
  const t = useTranslations("schedule");
  const cal = useTranslations("calendar");
  const { state, pending, onSubmit, formRef } = useKeepingForm(importIcsAction, idle, { resetOnSuccess: true });
  const err = state.status === "error" ? (t.has(`errors.${state.message}`) ? t(`errors.${state.message}`) : cal("errors.invalid")) : null;
  return (
    <Panel className="p-4 sm:p-5">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
        {err && <Notice tone="danger">{err}</Notice>}
        {state.status === "success" && state.summary && <Notice tone="success">{t("import.done", { entries: state.summary.entries, blocks: state.summary.classBlocks, skipped: state.summary.skipped })}</Notice>}
        <Field label={t("import.file")} htmlFor="ics-file" hint={t("import.hint")}>
          <Input id="ics-file" name="file" type="file" accept=".ics,text/calendar" required />
        </Field>
        <div>
          <Button type="submit" disabled={pending}>
            {t("import.submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
