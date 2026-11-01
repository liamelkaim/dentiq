// Display piece for retrieved passages. Server-compatible. A passage is shown as an EXCERPT with its source: where it
// comes from, who made it, which offering it belongs to, and a link to the page in Dentiq. It is never written in the
// first person or phrased like an answer, because nothing here is generated: it is text found in a source.
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Passage } from "@/server/tutor/types";
import { Badge, Panel } from "./ui";

export function PassageCard({ passage }: { passage: Passage }) {
  const t = useTranslations("tutor");
  const terms = useTranslations("terms");
  const { source } = passage;

  const originLabel =
    source.origin === "official"
      ? t("origin.official")
      : source.origin === "student"
        ? t("origin.student")
        : source.type === "note"
          ? t("origin.ownNote")
          : t("origin.ownDocument");
  const originTone = source.origin === "official" ? "accent" : source.origin === "own" ? "success" : "neutral";

  const offering = source.academicYear
    ? source.type === "question"
      ? t("offering.exam", { year: source.academicYear })
      : source.term
        ? t("offering.yearTerm", { year: source.academicYear, term: terms(source.term) })
        : t("offering.year", { year: source.academicYear })
    : t("offering.none");

  return (
    <Panel className="flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={originTone}>{originLabel}</Badge>
        <Badge>{t(`type.${source.type}`)}</Badge>
        {source.period === "historical" && <Badge tone="warning">{t("period.historical")}</Badge>}
        {source.answerStatus === "verified" && <Badge tone="success">{t("results.verifiedAnswer")}</Badge>}
      </div>
      <p className="text-[15px] font-semibold break-words">{source.title}</p>
      <p className="text-[13px] text-text-subtle">
        {source.courseCode} · {offering}
      </p>
      <div>
        <p className="mb-1 text-[12px] font-semibold text-text-subtle">{t("results.excerpt")}</p>
        <blockquote className="border-l-2 border-border pl-3 text-[14px] break-words whitespace-pre-line text-text-muted">{passage.text}</blockquote>
      </div>
      {passage.basis === "metadata" && <p className="text-[13px] text-text-subtle">{t("results.metadataOnly")}</p>}
      <Link href={source.href} className="inline-flex min-h-11 items-center self-start text-[14px] font-medium text-accent hover:text-accent-hover sm:min-h-0">
        {t("results.open")}
      </Link>
    </Panel>
  );
}
