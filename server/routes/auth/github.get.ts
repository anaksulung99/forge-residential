import { sendRedirect } from "h3";

export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true,
    scope: ["read:user", "user:email"],
  },
  async onSuccess(event, { user, tokens }) {
    const providerAccountId = String(user.id);
    const email = user.email;
    const name =
      user.name || user.login || (email ? email.split("@")[0] : "user");
    const avatar = user.avatar_url || null;

    if (!email || !name) throw new Error("Email or name is required");

    const result = await upsertOAuthUser({
      provider: "github",
      providerAccountId,
      email,
      name,
      avatar,
      tokens: {
        accessToken: tokens.access_token,
        tokenType: tokens.token_type,
        scope: tokens.scope,
      },
    });

    if (!result.user) throw new Error("User not found");

    await setUserSession(event, {
      user: buildSessionUser(result.user, {
        timezone: getTimezone(event).timezone,
        role: result.role,
        quota: result.quota,
      }),
      provider: "github",
      loggedInAt: new Date().toISOString(),
    });

    return sendRedirect(event, "/app");
  },
  onError(event, error) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const statusMessage = (error as any)?.statusMessage ?? "OAuth Error";
    const message = (error as any)?.message ?? String(error);
    console.error("[OAuth github] error", {
      statusCode,
      statusMessage,
      message,
    });
    return sendRedirect(event, "/?auth=error&provider=github");
  },
});
