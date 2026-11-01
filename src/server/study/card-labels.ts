import "server-only";
import { getTranslations } from "next-intl/server";
import type { CardLabels } from "./cards";

/** The words used on the back of a card and in exports, in the viewer's language (studyTools.cardLabels). */
export async function loadCardLabels(): Promise<CardLabels> {
  const t = await getTranslations("studyTools.cardLabels");
  return {
    verified: t("verified"),
    proposedUnverified: t("proposedUnverified"),
    noAnswer: t("noAnswer"),
    trueWord: t("true"),
    falseWord: t("false"),
    explanation: t("explanation"),
    source: t("source"),
    recalled: t("recalled"),
    released: t("released"),
  };
}
