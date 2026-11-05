import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cx } from "./ui";

/** The one footer: disclaimer, privacy, terms, cookies, accessibility, contact and help (signed in only). The contact page shows the address only once the owner has set one. */
export async function SiteFooter({ signedIn = false, className }: { signedIn?: boolean; className?: string }) {
  const t = await getTranslations("common");
  const l = await getTranslations("legal");
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
        <Link href="/cookies" className={link}>
          {l("cookiesLink")}
        </Link>
        <Link href="/accessibility" className={link}>
          {l("accessibilityLink")}
        </Link>
        <Link href="/contact" className={link}>
          {l("contactLink")}
        </Link>
        {signedIn && (
          <Link href="/help" className={link}>
            {t("help")}
          </Link>
        )}
      </nav>
    </footer>
  );
}
