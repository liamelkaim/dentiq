"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button, ButtonLink, Wordmark } from "@/components/ui";

/**
 * Error boundary for pages outside the signed-in app (sign-in, legal pages, study mode). It sits inside the root layout, so
 * language and theme are available. Errors in the root layout itself are handled by global-error.tsx. Never prints the
 * error message or a stack trace.
 */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations();
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <Wordmark className="mb-8" />
      <div role="alert">
        <h1 className="text-[22px] font-semibold tracking-tight">{t("errors.errorTitle")}</h1>
        <p className="mt-1 text-[15px] text-text-muted">{t("errors.errorBody")}</p>
        {digest && <p className="mt-2 text-[12px] text-text-subtle tabular-nums">{t("errors.reference", { code: digest })}</p>}
      </div>
      <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row">
        <Button onClick={() => retry()}>{t("common.retry")}</Button>
        <ButtonLink href="/" variant="secondary">
          {t("errors.goHome")}
        </ButtonLink>
      </div>
    </main>
  );
}
