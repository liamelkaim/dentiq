import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DeleteAccountForm } from "@/components/profile-forms";
import { Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { isLastAdmin } from "@/server/account/delete";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.delete"))("title") };
}

export default async function DeleteAccountPage() {
  const viewer = await requireUser();
  const t = await getTranslations("account.delete");
  const l = await getTranslations("legal");
  const list = (key: string) => t.raw(key) as string[];
  // Shown as a warning and the form is disabled; deleteAccount() refuses it again on the server.
  const blockedLastAdmin = await isLastAdmin(getDb(), viewer.id);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("intro")} back={{ href: "/profile", label: t("back") }} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">{t("deletedTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] text-text-muted">
            {list("deleted").map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">{t("keptTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] text-text-muted">
            {list("kept").map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-text-muted">{t("keptWhy")}</p>
        </Panel>
      </div>

      <Notice tone="warning" className="mt-4">
        {t("draftNote")}{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          {l("privacyLink")}
        </Link>
      </Notice>

      <Section className="mt-6">
        <DeleteAccountForm email={viewer.email} blockedLastAdmin={blockedLastAdmin} />
      </Section>
    </>
  );
}
