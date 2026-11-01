"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button, ButtonLink, Panel } from "@/components/ui";

/**
 * Error boundary for every signed-in page. It never prints the error message or a stack trace: production hides server
 * messages anyway, and a client error could still carry internal wording. Only the opaque digest is shown, so a student can
 * quote it when asking for help.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations();
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Panel role="alert" className="px-6 py-12 text-center">
      <p className="text-[17px] font-semibold">{t("errors.errorTitle")}</p>
      <p className="mt-1 text-[14px] text-text-muted">{t("errors.errorBody")}</p>
      {digest && <p className="mt-2 text-[12px] text-text-subtle tabular-nums">{t("errors.reference", { code: digest })}</p>}
      <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
        <Button onClick={() => retry()}>{t("common.retry")}</Button>
        <ButtonLink href="/" variant="secondary">
          {t("errors.goHome")}
        </ButtonLink>
      </div>
    </Panel>
  );
}
