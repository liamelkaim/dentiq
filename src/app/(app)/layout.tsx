import { AppShell } from "@/components/app-shell";
import { hasRole } from "@/server/auth/roles";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { getRecordingSettings } from "@/server/recordings/settings";
import { isTutorReady } from "@/server/tutor/service";

// Every page in this group requires a signed-in user. Pages and actions still check
// permissions themselves — this layout is not the only line of defence.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // False unless the admin flag is on AND a provider is configured (none exists), so the nav item reads "Off".
  const tutorReady = await isTutorReady(getDb());
  const recordingsOn = (await getRecordingSettings(getDb())).enabled;
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      isAdmin={hasRole(user, "admin")}
      isModerator={hasRole(user, "moderator")}
      library={canAccessLibrary(user)}
      tutorReady={tutorReady}
      recordingsOn={recordingsOn}
      contactEmail={process.env.CONTACT_EMAIL?.trim() || null}
    >
      {children}
    </AppShell>
  );
}
