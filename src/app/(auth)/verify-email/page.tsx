import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink, Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.verify"))("title") };
}

export default async function VerifyEmailPage() {
  const t = await getTranslations("auth.verify");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-[14px] text-text-muted">{t("body")}</p>
      {process.env.NODE_ENV !== "production" && (
        <Notice tone="accent" className="mt-5">
          {t("devHint")}
        </Notice>
      )}
      <ButtonLink href="/sign-in" variant="secondary" className="mt-6 w-full">
        {t("backToSignIn")}
      </ButtonLink>
    </>
  );
}
