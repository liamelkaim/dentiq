import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cx } from "./ui";

/** The one footer: disclaimer, privacy, terms, help (signed in only) and, when the owner has set an address, a contact link. */
export async function SiteFooter({ signedIn = false, className }: { signedIn?: boolean; className?: string }) {
  const t = await getTranslations("common");
  const l = await getTranslations("legal");
  const contact = process.env.CONTACT_EMAIL?.trim();
  const link = "inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline";
  return (
    <footer className={cx("text-[12px] text-text-subtle", className)}>
      <p>{t("disclaimer")}</p>
      <nav aria-label={t("footerNav")} className="mt-1 flex flex-wrap gap-x-4">
        <Link href="/privacy" className={link}>
          {l("privacyLink")}
        </Link>
        <Link href="/terms" className={link}>
          {l("termsLink")}
        </Link>
        {signedIn && (
          <Link href="/help" className={link}>
            {t("help")}
          </Link>
        )}
        {contact && (
          <a href={`mailto:${contact}`} className={link}>
            {t("contact")}
          </a>
        )}
      </nav>
    </footer>
  );
}
