import { sendRedirect } from "h3";

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user, tokens }) {
    const providerAccountId = String(user.id);
    const email = user.email;
    const name = user.name || (email ? email.split("@")[0] : "user");
    const avatar = user.picture || user.avatar_url || null;

    const result = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      name,
      avatar,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        idToken: tokens.idToken,
      },
    });

    if (!result.user) throw new Error("User not found");

    await setUserSession(event, {
      user: buildSessionUser(result.user, {
        timezone: getTimezone(event).timezone,
        role: result.role,
        quota: result.quota,
      }),
      provider: "google",
      loggedInAt: new Date().toISOString(),
    });

    return sendRedirect(event, "/app");
  },
  onError(event, error) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const statusMessage = (error as any)?.statusMessage ?? "OAuth Error";
    const message = (error as any)?.message ?? String(error);
    console.error("[OAuth google] error", {
      statusCode,
      statusMessage,
      message,
    });
    return sendRedirect(event, "/?auth=error&provider=google");
  },
});
