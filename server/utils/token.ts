import type { H3Event } from "h3";
import { randomBytes } from "node:crypto";

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

export function getTimezone(event: H3Event) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const rawLanguage = getHeader(event, "accept-language") || "en-US";
  const cleanLocale = rawLanguage.split(",")[0];

  return {
    serverTime: new Date().toLocaleString(cleanLocale, {
      timeZone: timezone,
    }),
    timezone: timezone,
  };
}
export function generateApiKey(byteLength = 16): string {
  const timestamp = Date.now().toString(36);

  const randomString = randomBytes(byteLength).toString("hex");

  return `sk_live_${timestamp}_${randomString}`;
}
