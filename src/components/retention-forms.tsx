"use client";

// Administrator form that applies the retention rules. Deleting needs the confirmation box; orphaned files have their own box.
import { useTranslations } from "next-intl";
import { applyRetentionAction, type RetentionFormState } from "@/server/retention/actions";
import { Button, Notice, Panel } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const initial: RetentionFormState = { status: "idle" };

export function RetentionApplyForm({ nothingToDo, orphansFound }: { nothingToDo: boolean; orphansFound: number }) {
  const t = useTranslations("retention");
  const all = useTranslations();
  const { state, pending, onSubmit, formRef } = useKeepingForm(applyRetentionAction, initial, { resetOnSuccess: true });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {state.status === "error" && state.message && <Notice tone="danger">{all(state.message)}</Notice>}
      {state.status === "success" && state.result && (
        <Notice tone={state.result.failed > 0 ? "warning" : "success"} title={t("done")}>
          {t("doneDetail", state.result)}
        </Notice>
      )}
      <Panel className="flex flex-col gap-2 p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold">{t("applyTitle")}</h2>
        <p className="text-[14px] text-text-muted">{t("applyHelp")}</p>
        <label className="flex min-h-11 items-center gap-3 text-[14px]">
          <input type="checkbox" name="confirm" required className="size-4 shrink-0 accent-[var(--accent)]" />
          <span>{t("confirm")}</span>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[14px]">
          <input type="checkbox" name="deleteOrphans" disabled={orphansFound === 0} className="size-4 shrink-0 accent-[var(--accent)]" />
          <span>{t("confirmOrphans")}</span>
        </label>
        <div>
          <Button type="submit" variant="danger" disabled={pending || (nothingToDo && orphansFound === 0)}>
            {t("apply")}
          </Button>
        </div>
      </Panel>
    </form>
  );
}
