import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PassBrowser } from "@/components/pass-browser";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes"))("title") };
}

/** Exam questions from all courses, with filters. Each course also has its own Passes tab. */
export default async function PassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("passes");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <PassBrowser viewer={viewer} basePath="/passes" search={await searchParams} newHref="/passes/new" />
    </>
  );
}
