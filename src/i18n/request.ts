import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { LOCALE_COOKIE, resolveLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: CALENDAR_TIME_ZONE,
  };
});
