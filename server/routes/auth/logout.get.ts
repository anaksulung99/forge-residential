import { sendRedirect } from "h3";

export default defineEventHandler(async (event) => {
  await clearUserSession(event);
  clearAllCookies(event);
  return sendRedirect(event, "/");
});
