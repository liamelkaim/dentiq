"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { createFeed, revokeFeed } from "./feed";

export type FeedState = { status: "idle" | "created" | "revoked" | "error"; path?: string };

/** Returns the secret address once; it is never stored in readable form. */
export async function createFeedAction(): Promise<FeedState> {
  const viewer = await requireUser();
  if (!canAccessLibrary(viewer)) return { status: "error" };
  const token = await createFeed(getDb(), viewer.id);
  revalidatePath("/calendar");
  return { status: "created", path: `/api/calendar-feed/${token}` };
}

export async function revokeFeedAction(): Promise<FeedState> {
  const viewer = await requireUser();
  await revokeFeed(getDb(), viewer.id);
  revalidatePath("/calendar");
  return { status: "revoked" };
}
