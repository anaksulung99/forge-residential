import { getRequestHeader, getRequestURL, sendRedirect } from "h3";

const publicApiPrefixes = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-verification",
  "/api/auth/verify-email",
  "/api/_auth/",
  "/api/public/",
  "/api/billing/webhook",
];
const guestPagePrefixes = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];
const protectedPagePrefixes = ["/app/"];
// Routes accessible by any logged-in user (free or premium)
const protectedUserApiPrefixes = ["/api/profile/", "/api/analytics/"];
// Routes accessible by premium users only
const protectedPremiumApiPrefixes = [
  "/api/integrations/",
  "/api/campaigns/",
  "/api/tools/",
  "/api/proxies/",
  "/api/upload/",
];
// Routes accessible by admin+ only
const protectedAdminApiPrefixes = [
  "/api/users/",
  "/api/workers/",
  "/api/roles/",
  "/api/admin/",
];

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const path = url.pathname;

  // ── Public API ──────────────────────────────────────────────────────────────
  if (path.startsWith("/api/")) {
    if (publicApiPrefixes.some((p) => path.startsWith(p))) return;
    await requireSession(event);

    if (protectedAdminApiPrefixes.some((p) => path.startsWith(p))) {
      await requireAdmin(event);
      return;
    }

    return;
  }

  // ── Protected pages ─────────────────────────────────────────────────────────
  if (protectedPagePrefixes.some((p) => path.startsWith(p))) {
    try {
      await requireSession(event);
    } catch {
      const accept = getRequestHeader(event, "accept") || "";
      if (!accept.includes("text/html")) {
        throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
      }
      const redirectTo = encodeURIComponent(path + url.search);
      return sendRedirect(event, `/login?redirect=${redirectTo}`);
    }
  }

  // ── Guest pages (redirect if already logged in) ───────────────────────────
  if (guestPagePrefixes.some((p) => path.startsWith(p))) {
    try {
      const session = await getUserSession(event);
      if (!session?.user) return;

      const redirect = url.searchParams.get("redirect") || "/";
      return sendRedirect(event, redirect);
    } catch {
      return; // continue to login page
    }
  }
});
