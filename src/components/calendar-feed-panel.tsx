"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createFeedAction, revokeFeedAction, type FeedState } from "@/server/calendar/feed-actions";
import { Button, Notice, Panel } from "./ui";

/** Create, show once, and revoke the private Apple Calendar subscription link. */
export function CalendarFeedPanel({ active, createdOn }: { active: boolean; createdOn: string | null }) {
  const t = useTranslations("calendar.feed");
  const [state, setState] = useState<FeedState>({ status: "idle" });
  const [pending, start] = useTransition();
  const isActive = state.status === "created" || (active && state.status !== "revoked");
  const url = state.path && typeof window !== "undefined" ? `${window.location.origin}${state.path}` : null;
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <h3 className="text-[15px] font-semibold">{t("title")}</h3>
      <p className="text-[14px] text-text-muted">{t("body")}</p>
      {state.status === "error" && <Notice tone="danger">{t("error")}</Notice>}
      {url && (
        <Notice tone="warning" title={t("shownOnce")}>
          <p>{t("shownOnceBody")}</p>
          <p className="mt-2 break-all font-mono text-[13px]" data-testid="feed-url">{url.replace(/^http/, "webcal")}</p>
          <p className="mt-2 text-[13px]">{t("applePath")}</p>
        </Notice>
      )}
      {isActive && !url && <p className="text-[13px] text-text-subtle">{t("active", { date: createdOn ?? "" })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => setState(await createFeedAction()))}>
          {isActive ? t("regenerate") : t("create")}
        </Button>
        {isActive && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => setState(await revokeFeedAction()))}>
            {t("revoke")}
          </Button>
        )}
      </div>
    </Panel>
  );
}
