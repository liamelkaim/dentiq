// WHO MAY SEE WHAT, as SQL conditions. Every library read (topic page, related panels, counts, search) builds its
// queries from these, so a link is only ever shown when the viewer may see the item on the other side too.
// The single-item rules live in resources/service.ts (canSeeResource) and passes/service.ts (canSeeQuestion);
// these mirror the list rules (listResources, listQuestions with publishedOnly). Callers check canAccessLibrary first.
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { courseNotes, examQuestions, resources } from "@/db/schema";
import type { Viewer } from "@/server/resources/service";

/** Shared published documents, plus the viewer's own items (private ones, and their own pending or hidden ones). */
export function visibleResources(viewer: Viewer): SQL {
  return and(
    or(eq(resources.visibility, "shared"), eq(resources.createdBy, viewer.id)),
    or(eq(resources.status, "published"), and(eq(resources.createdBy, viewer.id), inArray(resources.status, ["pending", "hidden"]))),
  )!;
}

/** Only published questions: pending, rejected and hidden ones never show up through a link, for anyone. */
export function visibleQuestions(): SQL {
  return eq(examQuestions.status, "published");
}

/** Notes are private: only the owner. Not even moderators or admins. */
export function visibleNotes(viewer: Viewer): SQL {
  return eq(courseNotes.ownerId, viewer.id);
}
