import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookIcon, FolderIcon, ShieldIcon } from "@/components/icons";
import { Badge, ButtonLink, DescriptionList, List, ListRow, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { hasRole } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { countCourses } from "@/server/catalog/service";
import { canAccessLibrary, isModerator, listModerationQueue } from "@/server/resources/service";
import { listUsers } from "@/server/users/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

const roadmap = ["passes", "flashcards", "tutor", "recordings"] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const db = getDb();
  const isAdmin = hasRole(user, "admin");
  const [courseCount, pending, queue] = await Promise.all([
    countCourses(db),
    isAdmin ? listUsers(db, { approvalStatus: "pending" }) : Promise.resolve([]),
    listModerationQueue(db, user),
  ]);
  const firstName = user.name.split(" ")[0] || user.name;

  return (
    <>
      <PageHeader title={t("dashboard.greeting", { name: firstName })} subtitle={t("dashboard.subtitle")} />

      {user.approvalStatus === "pending" && (
        <Notice tone="warning" title={t("dashboard.pendingTitle")} className="mb-8">
          {t("dashboard.pendingBody")}
        </Notice>
      )}
      {user.approvalStatus === "rejected" && (
        <Notice tone="danger" title={t("dashboard.rejectedTitle")} className="mb-8">
          {t("dashboard.rejectedBody")}
        </Notice>
      )}

      <div className="grid gap-x-6 sm:grid-cols-2">
        <Section title={t("dashboard.catalogTitle")}>
          <Panel className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[10px] bg-accent-soft text-accent">
                <BookIcon />
              </span>
              <div>
                <p className="text-[22px] leading-none font-semibold tracking-tight">{courseCount}</p>
                <p className="mt-1 text-[13px] text-text-subtle">
                  {courseCount > 0 ? t("courses.title") : t("dashboard.catalogCount", { count: courseCount })}
                </p>
              </div>
            </div>
            {courseCount === 0 && isAdmin && <p className="text-[14px] text-text-muted">{t("dashboard.catalogEmptyAdmin")}</p>}
            <div className="mt-auto flex flex-wrap gap-2">
              <ButtonLink href="/courses" variant="secondary">
                {t("dashboard.browseCatalog")}
              </ButtonLink>
              {isAdmin && (
                <ButtonLink href="/admin/catalog" variant="ghost">
                  {t("dashboard.manageCatalog")}
                </ButtonLink>
              )}
            </div>
          </Panel>
        </Section>

        <Section title={t("dashboard.accountTitle")}>
          <DescriptionList
            items={[
              { label: t("settings.role"), value: t(`roles.${user.role}`) },
              {
                label: t("settings.status"),
                value: (
                  <Badge tone={user.approvalStatus === "approved" ? "success" : user.approvalStatus === "pending" ? "warning" : "danger"}>
                    {t(`approval.${user.approvalStatus}`)}
                  </Badge>
                ),
              },
              ...(isAdmin
                ? [
                    {
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldIcon width={14} height={14} /> {t("admin.users")}
                        </span>
                      ),
                      value: (
                        <Link href="/admin/users" className="font-medium text-accent hover:text-accent-hover">
                          {t("admin.pendingCount", { count: pending.length })}
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      </div>

      <Section title={t("dashboard.resourcesTitle")}>
        <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
              <FolderIcon />
            </span>
            <p className="text-[14px] text-text-muted">
              {canAccessLibrary(user) ? t("dashboard.resourcesBody") : t("dashboard.resourcesLocked")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAccessLibrary(user) && (
              <ButtonLink href="/resources" variant="secondary">
                {t("dashboard.browseResources")}
              </ButtonLink>
            )}
            {isModerator(user) && (
              <ButtonLink href="/moderation" variant="ghost">
                {t("dashboard.reviewQueue", { count: queue.pending.length + queue.reports.length })}
              </ButtonLink>
            )}
          </div>
        </Panel>
      </Section>

      <Section title={t("dashboard.roadmapTitle")} description={t("dashboard.roadmapBody")}>
        <List>
          {roadmap.map((key) => (
            <ListRow key={key} className="justify-between">
              <span className="text-[15px] text-text-muted">{t(`dashboard.roadmap.${key}`)}</span>
              <Badge>{t("common.planned")}</Badge>
            </ListRow>
          ))}
        </List>
      </Section>
    </>
  );
}
