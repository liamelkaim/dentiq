import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/session";

// Created on the first request rather than at import time, so `next build` never opens the database.
const handler = () => toNextJsHandler(getAuth());

export const GET = (request: Request) => handler().GET(request);
export const POST = (request: Request) => handler().POST(request);
