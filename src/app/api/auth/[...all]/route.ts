import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/session";

export const { GET, POST } = toNextJsHandler(getAuth());
