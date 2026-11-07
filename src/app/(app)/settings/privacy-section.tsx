import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonClass, ButtonLink, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { getTutorConsent, TUTOR_CONSENT_VERSION } from "@/server/tutor/consent";

/** Consents, data rights and the privacy contact (shown only when configured). Own data only. */
export async function PrivacySection({ userId }: { userId: string }) {
  const t = await getTranslations("settings.privacy");
  const format = await getFormatter();
  const consent = await getTutorConsent(getDb(), userId);
  const contact = process.env.CONTACT_EMAIL?.trim();
  const link = "text-accent underline underline-offset-2 hover:text-accent-hover";
  const status = !consent
    ? t("tutorNone")
    : t(consent.version === TUTOR_CONSENT_VERSION ? "tutorGiven" : "tutorOutdated", {
        date: format.dateTime(consent.acceptedAt, { dateStyle: "long" }),
        language: t(consent.locale === "en" ? "langEn" : "langFr"),
        version: consent.version,
      });
  return (
    <Section title={t("title")} description={t("help")}>
      <Panel className="divide-y divide-border">
        <div className="flex flex-col gap-1 px-4 py-3">
          <h3 className="text-[15px] font-semibold">{t("consentsTitle")}</h3>
          <p className="text-[14px]"><strong className="font-medium">{t("tutorLabel")}</strong> · {status}</p>
          <Link href="/tutor" className={`${link} text-[14px]`}>{t("tutorOpen")}</Link>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          <h3 className="text-[15px] font-semibold">{t("dataTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            {/* A plain link (not next/link): the response is a file download. */}
            <a href="/profile/export" download className={buttonClass("secondary")}>{t("export")}</a>
            <ButtonLink href="/profile" variant="secondary">{t("correct")}</ButtonLink>
            <ButtonLink href="/profile/delete" variant="danger">{t("delete")}</ButtonLink>
          </div>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3">
          {contact && (
            <>
              <h3 className="text-[15px] font-semibold">{t("contactTitle")}</h3>
              <a href={`mailto:${contact}`} className={`${link} text-[14px]`}>{contact}</a>
            </>
          )}
          <Link href="/privacy" className={`${link} text-[14px]`}>{t("readPolicy")}</Link>
        </div>
      </Panel>
    </Section>
  );
}
