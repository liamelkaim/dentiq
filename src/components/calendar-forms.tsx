"use client";

// The calendar entry form. It only collects what the student types; every rule (date range, valid date, time, limits,
// ownership) is checked again by the server action and the service.
import { useTranslations } from "next-intl";
import { CALENDAR_NOTE_MAX, CALENDAR_TITLE_MAX, CALENDAR_YEAR_MAX, CALENDAR_YEAR_MIN } from "@/server/calendar/constants";
import { deleteEntryAction, saveEntryAction, type CalendarFormState } from "@/server/calendar/actions";
import { Button, ButtonLink, Field, Input, Notice, Panel, Select, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: CalendarFormState = { status: "idle" };

export type EntryFormInitial = {
  id?: string;
  title: string;
  date: string;
  time: string | null;
  courseId: string | null;
  kind: string;
  note: string | null;
};

export function CalendarEntryForm({
  courses,
  kinds,
  initial,
  cancelHref,
  maxEntries,
}: {
  courses: { id: string; label: string }[];
  kinds: readonly string[];
  initial: EntryFormInitial;
  cancelHref: string;
  maxEntries: number;
}) {
  const t = useTranslations("calendar");
  const common = useTranslations("common");
  const { state, pending, onSubmit } = useKeepingForm(saveEntryAction, idle);
  const errorText = (code: string | undefined) => (code ? (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.invalid")) : undefined);
  const fieldError = (name: string) => errorText(state.fieldErrors?.[name]);
  // A message with no field next to it (limit reached, not found...) goes in the banner.
  const banner = state.status === "error" && !state.fieldErrors ? errorText(state.message) : undefined;

  return (
    <Panel className="p-4 sm:p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        {banner && <Notice tone="danger">{banner}</Notice>}
        <Field label={t("form.title")} htmlFor="cal-title" error={fieldError("title")}>
          <Input id="cal-title" name="title" required maxLength={CALENDAR_TITLE_MAX} defaultValue={initial.title} aria-invalid={Boolean(fieldError("title"))} aria-describedby={fieldError("title") ? "cal-title-error" : undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.date")} htmlFor="cal-date" hint={t("form.dateHint", { min: CALENDAR_YEAR_MIN, max: CALENDAR_YEAR_MAX })} error={fieldError("date")}>
            <Input
              id="cal-date"
              name="date"
              type="date"
              required
              min={`${CALENDAR_YEAR_MIN}-01-01`}
              max={`${CALENDAR_YEAR_MAX}-12-31`}
              defaultValue={initial.date}
              aria-invalid={Boolean(fieldError("date"))}
              aria-describedby={fieldError("date") ? "cal-date-error" : "cal-date-hint"}
            />
          </Field>
          <Field label={t("form.time")} htmlFor="cal-time" optional={common("optional")} hint={t("form.timeHint")} error={fieldError("time")}>
            <Input id="cal-time" name="time" type="time" defaultValue={initial.time ?? ""} aria-invalid={Boolean(fieldError("time"))} aria-describedby={fieldError("time") ? "cal-time-error" : "cal-time-hint"} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.kind")} htmlFor="cal-kind">
            <Select id="cal-kind" name="kind" defaultValue={initial.kind}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`kinds.${kind}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("form.course")} htmlFor="cal-course" optional={common("optional")} error={fieldError("courseId")}>
            <Select id="cal-course" name="courseId" defaultValue={initial.courseId ?? ""}>
              <option value="">{t("form.noCourse")}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("form.note")} htmlFor="cal-note" optional={common("optional")} error={fieldError("note")}>
          <Textarea id="cal-note" name="note" rows={3} maxLength={CALENDAR_NOTE_MAX} defaultValue={initial.note ?? ""} />
        </Field>
        <p className="text-[13px] text-text-subtle">
          {t("privacy")} {t("form.limit", { max: maxEntries })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {common("save")}
          </Button>
          <ButtonLink href={cancelHref} variant="ghost">
            {common("cancel")}
          </ButtonLink>
        </div>
      </form>
      {initial.id && (
        <form action={deleteEntryAction} className="mt-5 border-t border-border pt-4">
          <input type="hidden" name="id" value={initial.id} />
          <Button type="submit" variant="danger" size="sm">
            {t("form.delete")}
          </Button>
        </form>
      )}
    </Panel>
  );
}
