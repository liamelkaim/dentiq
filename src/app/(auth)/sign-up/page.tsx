import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.signUp"))("title") };
}

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-muted">{t("subtitle")}</p>
      <SignUpForm />
    </>
  );
}
