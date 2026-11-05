"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { submitAppealAction, type AppealFormState } from "@/server/appeals/actions";
import { Button, Field, Notice, Panel, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const initial: AppealFormState = { status: "idle" };

/** Shown to the author of an item a moderator hid or rejected. */
export function AppealForm({ entityType, entityId }: { entityType: "resource" | "question"; entityId: string }) {
  const t = useTranslations("appeals");
  const all = useTranslations();
  const p = useId();
  const { state, pending, onSubmit } = useKeepingForm(submitAppealAction, initial);
  if (state.status === "success") return <Notice tone="success">{t("sent")}</Notice>;
  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <h3 className="text-[15px] font-semibold">{t("title")}</h3>
        <p className="text-[14px] text-text-muted">{t("help")}</p>
        {state.status === "error" && state.message && <Notice tone="danger">{all.has(state.message) ? all(state.message) : t("errors.invalid")}</Notice>}
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <Field label={t("message")} htmlFor={`${p}-m`}>
          <Textarea id={`${p}-m`} name="message" required minLength={10} maxLength={1000} rows={3} />
        </Field>
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>{t("submit")}</Button>
        </div>
      </form>
    </Panel>
  );
}
