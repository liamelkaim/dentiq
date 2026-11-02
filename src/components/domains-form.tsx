"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { updateDomainsAction, type DomainsFormState } from "@/server/auth/domains-actions";
import { Button, Field, Notice, Panel, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: DomainsFormState = { status: "idle" };

export function DomainsForm({ initial, udem }: { initial: string; udem: string }) {
  const t = useTranslations("admin.domains");
  const all = useTranslations();
  const area = useRef<HTMLTextAreaElement>(null);
  const { state, pending, onSubmit } = useKeepingForm(updateDomainsAction, idle);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {state.status !== "idle" && state.message && <Notice tone={state.status === "success" ? "success" : "danger"}>{all(state.message)}</Notice>}
      <Panel className="flex flex-col gap-4 p-4 sm:p-5">
        <Field label={t("label")} htmlFor="domains-list" hint={t("hint")}>
          <Textarea id="domains-list" name="domains" ref={area} rows={5} defaultValue={initial} aria-describedby="domains-list-hint" spellCheck={false} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => { if (area.current) area.current.value = udem; }}>
            {t("presetUdem")}
          </Button>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </Panel>
    </form>
  );
}
