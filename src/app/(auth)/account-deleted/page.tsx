import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.deleted"))("title") };
}

export default async function AccountDeletedPage() {
  const t = await getTranslations("account.deleted");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-[14px] text-text-muted">{t("body")}</p>
      <ButtonLink href="/sign-in" variant="secondary" className="mt-6 w-full">
        {t("signIn")}
      </ButtonLink>
    </>
  );
}
