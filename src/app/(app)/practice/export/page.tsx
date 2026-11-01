import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "@/components/icons";
import { ScopeFields } from "@/components/study-scope";
import { PrivacyNote } from "@/components/study-ui";
import { Button, Field, Notice, PageHeader, Panel, Select } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { parseStudyScope } from "@/server/study/scope";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.export"))("title") };
}

/** Downloads limited to what the student may see: published questions in their scope, plus their own cards and progress. */
export default async function ExportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.export");
  const root = await getTranslations("studyTools");
  const back = { href: "/practice", label: root("title") };

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const scope = parseStudyScope(await searchParams);
  const kinds = ["questions", "cards", "progress", "anki"] as const;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} back={back} />
      <Panel className="p-4">
        <form method="get" action="/api/study-export" className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ScopeFields viewer={viewer} scope={{ ...scope, mark: undefined }} mode="export" idPrefix="ex" />
            <Field label={t("format")} htmlFor="ex-format">
              <Select id="ex-format" name="format" defaultValue="csv">
                <option value="csv">{t("formatCsv")}</option>
                <option value="tsv">{t("formatTsv")}</option>
              </Select>
            </Field>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {kinds.map((kind) => (
              <li key={kind} className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
                <p className="text-[15px] font-semibold">{t(`kinds.${kind}.title`)}</p>
                <p className="text-[13px] text-text-muted">{t(`kinds.${kind}.body`)}</p>
                {kind === "anki" && <Notice tone="warning">{t("ankiUnverified")}</Notice>}
                <div className="mt-auto pt-1">
                  <Button type="submit" name="kind" value={kind} variant={kind === "anki" ? "secondary" : "primary"} size="sm">
                    <DownloadIcon width={16} height={16} />
                    {t(`kinds.${kind}.button`)}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </form>
      </Panel>
      <div className="mt-4 flex flex-col gap-2 text-[13px] text-text-subtle">
        <p>{t("scopeNote")}</p>
        <p>{t("columnsNote")}</p>
        <p>{t("formulaNote")}</p>
        <PrivacyNote />
      </div>
    </>
  );
}
