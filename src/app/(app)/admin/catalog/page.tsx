import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseForm, ImportForm, ProgramForm } from "@/components/admin-forms";
import { List, ListRow, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireRole } from "@/server/auth/session";
import { listPrograms } from "@/server/catalog/service";
import { CSV_TEMPLATE_HEADER } from "@/server/catalog/validation";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("catalog") };
}

export default async function AdminCatalogPage() {
  await requireRole("admin");
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const programs = await listPrograms(getDb());
  const programOptions = programs.map(({ id, nameFr, nameEn }) => ({ id, nameFr, nameEn }));

  return (
    <>
      <PageHeader back={{ href: "/admin", label: t("admin.title") }} title={t("admin.catalog")} subtitle={t("admin.catalogHelp")} />

      <Section title={t("admin.programs.title")}>
        <div className="flex flex-col gap-4">
          {programs.length === 0 ? (
            <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("admin.programs.empty")}</Panel>
          ) : (
            <List>
              {programs.map((p) => (
                <ListRow key={p.id} className="justify-between">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{localized(locale, p.nameFr, p.nameEn)}</span>
                    <span className="block truncate text-[13px] text-text-subtle">{p.institution}</span>
                  </span>
                  <code className="text-[12px] text-text-subtle">{p.slug}</code>
                </ListRow>
              ))}
            </List>
          )}
          <ProgramForm />
        </div>
      </Section>

      <Section title={t("courses.title")}>
        <div className="flex flex-col gap-4">
          <ImportForm programs={programOptions} header={CSV_TEMPLATE_HEADER} />
          <CourseForm programs={programOptions} />
        </div>
      </Section>
    </>
  );
}
