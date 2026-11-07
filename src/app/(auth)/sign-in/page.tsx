import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { getAllowedDomains } from "@/server/auth/domains";
import { SignInForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  const seo = await getTranslations("seo");
  return { title: t("title"), description: seo("signIn"), alternates: { canonical: "/sign-in" } };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const domain = (await getAllowedDomains(getDb()))[0] ?? null;
  const t = await getTranslations("auth.signIn");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-muted">{t("subtitle")}</p>
      {reset === "1" && (
        <Notice tone="success" className="mb-4">
          {t("resetDone")}
        </Notice>
      )}
      <SignInForm domain={domain} />
    </>
  );
}
