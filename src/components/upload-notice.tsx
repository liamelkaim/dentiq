"use client";

import { useTranslations } from "next-intl";
import { Notice } from "./ui";

/** Shown at every upload and pass submission: no identifiable patient information, permission to share, reporting (not for private recordings, which cannot be reported). */
export function UploadNotice({ reportable = true }: { reportable?: boolean } = {}) {
  const t = useTranslations("legal.uploadNotice");
  return (
    <Notice tone="warning" title={t("title")}>
      <p>{t("noPatient")}</p>
      <p className="mt-1">{t("permission")}</p>
      {reportable && <p className="mt-1">{t("report")}</p>}
    </Notice>
  );
}
