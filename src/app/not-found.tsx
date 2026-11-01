import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink, Wordmark } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("errors"))("notFoundTitle") };
}

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Wordmark className="mb-8" />
      <h1 className="text-[22px] font-semibold tracking-tight">{t("notFoundTitle")}</h1>
      <p className="mt-1 text-[15px] text-text-muted">{t("notFoundBody")}</p>
      <ButtonLink href="/" variant="secondary" className="mt-6">
        {t("goHome")}
      </ButtonLink>
    </main>
  );
}
