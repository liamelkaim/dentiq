import { requireUser } from "@/server/auth/session";

// Focus Study Mode: no app shell, only what's needed to read. Pages still check permissions themselves.
export default async function StudyLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
