import { AppShell } from "@/components/app-shell";
import { hasRole } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";

// Every page in this group requires a signed-in user. Pages and actions still check
// permissions themselves — this layout is not the only line of defence.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      isAdmin={hasRole(user, "admin")}
      isModerator={hasRole(user, "moderator")}
    >
      {children}
    </AppShell>
  );
}
