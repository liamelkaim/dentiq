"use client";

import { useTranslations } from "next-intl";
import { onboardingAction, type OnboardingState } from "@/server/onboarding/actions";
import { PROGRAM_YEAR_MAX, SEMESTER_MAX, UNIVERSITY_PRESETS } from "@/server/onboarding/presets";
import { Button, Field, Notice, Panel, Select } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: OnboardingState = { status: "idle" };
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const { state, pending, onSubmit } = useKeepingForm(onboardingAction, idle);
  return (
    <Panel className="p-4 sm:p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {state.status === "error" && <Notice tone="danger">{t("error")}</Notice>}
        <Field label={t("university")} htmlFor="ob-university" hint={t("universityHelp")}>
          <Select id="ob-university" name="university" defaultValue="">
            <option value="">{t("choose")}</option>
            {UNIVERSITY_PRESETS.map((k) => (
              <option key={k} value={k}>
                {t(`presets.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("programYear")} htmlFor="ob-year">
          <Select id="ob-year" name="programYear" defaultValue="">
            <option value="">{t("choose")}</option>
            {range(PROGRAM_YEAR_MAX).map((n) => (
              <option key={n} value={n}>
                {t("yearOption", { n })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("semester")} htmlFor="ob-semester" hint={t("semesterHelp")}>
          <Select id="ob-semester" name="semester" defaultValue="">
            <option value="">{t("choose")}</option>
            {range(SEMESTER_MAX).map((n) => (
              <option key={n} value={n}>
                {t("semesterOption", { n })}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          <Button type="submit" name="skip" value="1" variant="ghost" formNoValidate disabled={pending}>
            {t("skip")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
