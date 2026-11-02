import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  const seo = await getTranslations("seo");
  return { title: t("title"), description: seo("signUp"), alternates: { canonical: "/sign-up" } };
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
