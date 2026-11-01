// Upload endpoint for the forms that send files (documents, new versions, question images). Server actions are capped at
// a small body size in next.config.ts, so everything large comes here instead, where the size is checked per kind, after
// the session and before the body is read. Answers JSON: { state, redirectTo? } for the form to show or follow.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { uploadKinds } from "@/server/uploads/kinds";
import { readLimitedFormData } from "@/server/uploads/read-body";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind: name } = await params;
  const kind = Object.hasOwn(uploadKinds, name) ? uploadKinds[name] : undefined;
  if (!kind) return new Response(null, { status: 404, headers: NO_STORE });

  // Who is asking comes first: an anonymous request never gets its body read.
  const viewer = await getCurrentUser();
  if (!viewer) return json({ state: { status: "error", message: "errors.generic" }, redirectTo: "/sign-in" }, 401);

  // Browsers always send Origin on a POST; a request from another site is refused (same rule Next applies to server
  // actions: the Origin host must be the host the request was sent to, as seen through a trusted proxy).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin !== null && (!host || new URL(origin).host !== host)) return json({ state: kind.invalid }, 403);

  const body = await readLimitedFormData(request, await kind.maxBodyBytes());
  if (!body.ok) return body.reason === "tooLarge" ? json({ state: kind.tooLarge }, 413) : json({ state: kind.invalid }, 400);

  return json(await kind.run(viewer, body.form));
}
