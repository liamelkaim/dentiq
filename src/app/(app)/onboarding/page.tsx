import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OnboardingForm } from "@/components/onboarding-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("onboarding"))("title") };
}

export default async function OnboardingPage() {
  await requireUser();
  const t = await getTranslations("onboarding");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("intro")} />
      <div className="max-w-xl">
        <OnboardingForm />
      </div>
    </>
  );
}
