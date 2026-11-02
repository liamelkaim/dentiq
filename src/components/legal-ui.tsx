// Pieces shared by the draft legal pages: the "draft, not reviewed" banner and the contact placeholder.
import { getTranslations } from "next-intl/server";
import { Notice } from "./ui";

export async function LegalDraftBanner() {
  const t = await getTranslations("legal");
  return (
    <Notice tone="warning">
      <strong className="font-semibold text-text">{t("draftBanner")}</strong>
    </Notice>
  );
}

/** Marked clearly as "to fill in": no address has been invented. */
export async function LegalContact() {
  const t = await getTranslations("legal");
  const contact = process.env.CONTACT_EMAIL?.trim();
  if (contact) {
    return (
      <section>
        <h2 className="text-[18px] font-semibold">{t("contactTitle")}</h2>
        <p className="mt-2">
          <a href={`mailto:${contact}`} className="font-medium text-accent underline underline-offset-2">
            {contact}
          </a>
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="text-[18px] font-semibold">{t("contactTitle")}</h2>
      <p className="mt-2 rounded-[var(--radius-control)] border border-dashed border-border-strong bg-surface-muted px-3 py-2 text-text-muted">
        {t("contactPlaceholder")}
      </p>
    </section>
  );
}
