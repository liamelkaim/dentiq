import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResendVerificationForm } from "@/components/auth-forms";
import { ButtonLink, Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.verifyResult"))("title") };
}

/** Where a confirmation link lands. A confirmed student is signed in and sent to the app before reaching this page, so
 *  what shows here is the failure case (expired or already used link) with a way to ask for a new one. */
export default async function VerifyResultPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.verifyResult");
  if (!error) {
    return (
      <>
        <h1 className="text-[22px] font-semibold tracking-tight">{t("doneTitle")}</h1>
        <p className="mt-2 text-[14px] text-text-muted">{t("doneBody")}</p>
        <ButtonLink href="/sign-in" className="mt-6 w-full">
          {t("signIn")}
        </ButtonLink>
      </>
    );
  }
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("expiredTitle")}</h1>
      <Notice tone="warning" className="mt-4 mb-5">
        {t("expiredBody")}
      </Notice>
      <ResendVerificationForm />
    </>
  );
}
