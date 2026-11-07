"use client";

import { useTranslations } from "next-intl";
import { loadUdemProgramAction, type ProgramSeedState } from "@/server/catalog/program-actions";
import { Button, Notice, Panel } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

export function ProgramSeedForm() {
  const t = useTranslations("admin.program");
  const { state, pending, onSubmit } = useKeepingForm(loadUdemProgramAction, { status: "idle" } as ProgramSeedState);
  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-5">
      {state.status === "error" && <Notice tone="danger">{t("error")}</Notice>}
      {state.status === "success" && state.summary && <Notice tone="success">{t("done", { courses: state.summary.courses, terms: state.summary.terms, periods: state.summary.periods })}</Notice>}
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled={pending}>
          {t("load")}
        </Button>
      </form>
    </Panel>
  );
}
