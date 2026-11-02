import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.forgot"))("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-muted">{t("subtitle")}</p>
      <ForgotPasswordForm />
      <p className="mt-4 text-center text-[14px]">
        <Link href="/sign-in" className="inline-flex min-h-11 items-center font-medium text-accent hover:text-accent-hover">
          {t("back")}
        </Link>
      </p>
    </>
  );
}
