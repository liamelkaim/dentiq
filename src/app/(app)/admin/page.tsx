import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookIcon, ShieldIcon } from "@/components/icons";
import { List, ListLinkRow, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { countCourses } from "@/server/catalog/service";
import { listUsers } from "@/server/users/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("title") };
}

export default async function AdminPage() {
  await requireRole("admin");
  const t = await getTranslations();
  const db = getDb();
  const [courseCount, pending] = await Promise.all([countCourses(db), listUsers(db, { approvalStatus: "pending" })]);

  const iconBox = "grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted";
  return (
    <>
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />
      <List>
        <ListLinkRow
          href="/admin/catalog"
          leading={<span className={iconBox}><BookIcon width={18} height={18} /></span>}
          title={t("admin.catalog")}
          subtitle={`${t("admin.catalogHelp")} · ${t("dashboard.catalogCount", { count: courseCount })}`}
        />
        <ListLinkRow
          href="/admin/users"
          leading={<span className={iconBox}><ShieldIcon width={18} height={18} /></span>}
          title={t("admin.users")}
          subtitle={`${t("admin.usersHelp")} · ${t("admin.pendingCount", { count: pending.length })}`}
        />
      </List>
    </>
  );
}
