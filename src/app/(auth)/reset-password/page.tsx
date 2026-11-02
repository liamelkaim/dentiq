import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth-forms";
import { ButtonLink, Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.reset"))("title") };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const t = await getTranslations("auth.reset");
  const usable = typeof token === "string" && token.length > 0 && !error;
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      {usable ? (
        <>
          <p className="mt-1 mb-6 text-[14px] text-text-muted">{t("subtitle")}</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <>
          <Notice tone="warning" className="mt-4">
            {t("invalid")}
          </Notice>
          <ButtonLink href="/forgot-password" className="mt-6 w-full">
            {t("requestNew")}
          </ButtonLink>
        </>
      )}
    </>
  );
}
