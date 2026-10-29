import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.signIn"))("title") };
}

export default async function SignInPage() {
  const t = await getTranslations("auth.signIn");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-muted">{t("subtitle")}</p>
      <SignInForm />
    </>
  );
}
