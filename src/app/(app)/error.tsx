"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button, ButtonLink, Panel } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Panel role="alert" className="px-6 py-12 text-center">
      <p className="text-[17px] font-semibold">{t("errors.errorTitle")}</p>
      <p className="mt-1 text-[14px] text-text-muted">{t("errors.errorBody")}</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={reset}>{t("common.retry")}</Button>
        <ButtonLink href="/" variant="secondary">
          {t("errors.goHome")}
        </ButtonLink>
      </div>
    </Panel>
  );
}
