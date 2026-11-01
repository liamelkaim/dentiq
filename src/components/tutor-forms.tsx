"use client";

// Administrator form for the tutor switch and limits. The warning is shown above the switch, every time.
import { useTranslations } from "next-intl";
import { useActionState, useId, useTransition, type FormEvent } from "react";
import { updateTutorSettingsAction, type TutorFormState } from "@/server/tutor/actions";
import { Button, Field, Input, Notice, Panel } from "./ui";

const initial: TutorFormState = { status: "idle" };

export type TutorSettingsFormProps = {
  enabled: boolean;
  dailyQuestionLimit: number;
  maxContextChars: number;
  dailyBounds: readonly [number, number];
  contextBounds: readonly [number, number];
  providerId: string | null;
};

export function TutorSettingsForm(props: TutorSettingsFormProps) {
  const t = useTranslations("tutor.admin");
  const all = useTranslations();
  const id = useId();
  const [state, formAction, pending] = useActionState(updateTutorSettingsAction, initial);
  const [, startTransition] = useTransition();

  // Submit through the action without React's automatic form reset, so an error never wipes the form.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Notice tone="warning" title={t("warningTitle")}>
        {t("warning")}
      </Notice>
      {state.status !== "idle" && state.message && <Notice tone={state.status === "success" ? "success" : "danger"}>{all.has(state.message) ? all(state.message) : state.message}</Notice>}

      <Panel className="flex flex-col gap-4 p-4 sm:p-5">
        <p className="text-[14px]">
          <span className="font-medium">{t("providerLabel")}:</span> <span className="text-text-muted">{props.providerId ?? t("providerNone")}</span>
        </p>
        <label className="flex min-h-11 items-center gap-3 text-[14px]">
          <input type="checkbox" name="enabled" defaultChecked={props.enabled} className="size-4 shrink-0 accent-[var(--accent)]" />
          <span>{t("enabled")}</span>
        </label>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[15px] font-semibold">{t("limitsTitle")}</legend>
          <Field label={t("dailyLimit")} htmlFor={`${id}-daily`} hint={t("dailyLimitHint", { min: props.dailyBounds[0], max: props.dailyBounds[1] })}>
            <Input id={`${id}-daily`} name="dailyQuestionLimit" type="number" inputMode="numeric" min={props.dailyBounds[0]} max={props.dailyBounds[1]} defaultValue={props.dailyQuestionLimit} required aria-describedby={`${id}-daily-hint`} />
          </Field>
          <Field label={t("maxContext")} htmlFor={`${id}-ctx`} hint={t("maxContextHint", { min: props.contextBounds[0], max: props.contextBounds[1] })}>
            <Input id={`${id}-ctx`} name="maxContextChars" type="number" inputMode="numeric" min={props.contextBounds[0]} max={props.contextBounds[1]} defaultValue={props.maxContextChars} required aria-describedby={`${id}-ctx-hint`} />
          </Field>
        </fieldset>
      </Panel>

      <div>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
