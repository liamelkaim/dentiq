import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { getAllowedDomains } from "@/server/auth/domains";
import { SignUpForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  const seo = await getTranslations("seo");
  return { title: t("title"), description: seo("signUp"), alternates: { canonical: "/sign-up" } };
}

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  // The university preset: when sign-up is limited to a domain, the form shows it (e.g. prenom.nom@umontreal.ca).
  const domain = (await getAllowedDomains(getDb()))[0] ?? null;
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-muted">{t("subtitle")}</p>
      <SignUpForm domain={domain} />
    </>
  );
}
