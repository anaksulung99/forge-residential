import type { H3Event } from "h3";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import type { UserSession, User } from "#auth-utils";

type OAuthProvider = "github" | "google";

export const ROLE_LEVELS: Record<UserRole, number> = {
  superadmin: 0,
  admin: 1,
  user: 2,
};
export const USER_ROLES: UserRole[] = ["superadmin", "admin", "user"];

// ── Guards ──────────────────────────────────────────────────────────────────

export function hasMinRole(
  currentRole: string | undefined,
  minRole: UserRole,
): boolean {
  const current = (currentRole ?? "user") as UserRole;
  const level = ROLE_LEVELS[current] ?? ROLE_LEVELS.user;
  return level <= ROLE_LEVELS[minRole];
}

export function isAdmin(currentRole: string | undefined): boolean {
  return hasMinRole(currentRole, "admin");
}

export function isSuperAdmin(currentRole: string | undefined): boolean {
  return currentRole === "superadmin";
}

export function getSessionRole(session: UserSession): UserRole {
  const roleName = session?.user?.role?.name || "user";
  if (!USER_ROLES.includes(roleName as UserRole)) return "user";
  return roleName as UserRole;
}

export function buildSessionUser(
  user: Record<string, any>,
  options: {
    timezone: string;
    role?: unknown;
    quota?: Record<string, any> | null;
  },
) {
  const { quota: userQuota, passwordHash: _passwordHash, ...sessionUser } = user;
  const quota = options.quota ?? userQuota;

  return safeSerialize({
    ...sessionUser,
    passwordHash: null,
    timezone: options.timezone,
    role: options.role ?? user.role,
    quotaBytes: quota?.quotaBytes ?? 0,
    quotaRequests: quota?.quotaRequests ?? 0,
    usedBytes: quota?.usedBytes ?? 0,
    usedRequests: quota?.usedRequests ?? 0,
  });
}

// ── Session route guards ────────────────────────────────────────────────────
export async function requireSession(event: H3Event) {
  const session = await getUserSession(event);
  if (!session?.user) {
    clearUserSession(event);
    throw createError({
      statusCode: 401,
      statusMessage: "Login required",
      data: {
        success: false,
        code: "UNAUTHORIZED",
        message: "Login required",
      },
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    include: {
      role: true,
      quota: true,
    },
  });

  if (!user) {
    clearUserSession(event);
    throw createError({
      statusCode: 403,
      statusMessage: "User not found",
      data: {
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      },
    });
  }

  if (!user.isActive) {
    clearUserSession(event);
    throw createError({
      statusCode: 403,
      statusMessage: "Account is disabled",
      data: {
        success: false,
        code: "ACCOUNT_DISABLED",
        message: "Account is disabled",
      },
    });
  }

  const userSession = {
    ...session,
    user: buildSessionUser(user, {
      timezone: session.user.timezone || "Asia/Jakarta",
    }),
  };

  event.context.userSession = userSession;
  event.context.currentUser = userSession.user;

  return userSession;
}

export async function getSessionFromContext(
  event: H3Event,
): Promise<UserSession> {
  if (event.context.userSession && event.context.userSession.user) {
    return event.context.userSession;
  }

  const session = await requireSession(event);
  event.context.userSession = session;

  return session;
}

export async function getCurrentUserFromContext(event: H3Event): Promise<User> {
  if (event.context.currentUser) {
    return event.context.currentUser;
  }

  let session = event.context.userSession;

  if (!session) {
    session = await getSessionFromContext(event);
  }

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Login required",
      data: {
        success: false,
        code: "UNAUTHORIZED",
        message: "Login required",
      },
    });
  }

  event.context.currentUser = session.user;

  return session.user;
}

export async function requireRole(event: H3Event, minRole: UserRole) {
  const session = await requireSession(event);
  const role = getSessionRole(session);
  if (!hasMinRole(role, minRole)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Minimum role required: ${minRole}`,
      data: {
        success: false,
        code: "FORBIDDEN",
        message: `Minimum role required: ${minRole}`,
        currentRole: role,
        requiredRole: minRole,
      },
    });
  }
  return session;
}

export async function requireAdmin(event: H3Event) {
  const adminName = ["superadmin", "admin"];

  const session = await requireSession(event);
  const role = getSessionRole(session);
  if (!adminName.includes(role)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin role required",
      data: {
        success: false,
        code: "FORBIDDEN",
        message: "Admin role required",
        currentRole: role,
        requiredRole: adminName.join(","),
      },
    });
  }
  return session;
}

export async function requireSuperAdmin(event: H3Event) {
  return requireRole(event, "superadmin");
}

export const roleGuardSchema = z.object({
  minRole: z.enum(USER_ROLES).optional().default("user"),
  requirePremium: z.boolean().optional().default(false),
});

type OAuthTokenInput = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
};

export async function ensureDefaultRoleId() {
  const existing = await prisma.role.findFirst({
    where: {
      name: "user",
      level: 2,
    },
    select: {
      id: true,
    },
  });

  if (existing) return existing.id;

  try {
    const created = await prisma.role.create({
      data: {
        name: "user",
        level: 2,
      },
      select: {
        id: true,
      },
    });

    return created.id;
  } catch {
    const fallback = await prisma.role.findFirst({
      where: {
        name: "user",
        level: 2,
      },
      select: {
        id: true,
      },
    });

    if (!fallback) throw new Error("Default role tidak bisa dibuat");
    return fallback.id;
  }
}

export async function ensureDefaultRole() {
  const existing = await prisma.role.findFirst({
    where: {
      name: "user",
      level: 2,
    },
  });

  if (existing) return existing;

  try {
    const created = await prisma.role.create({
      data: {
        name: "user",
        level: 2,
      },
    });

    return created;
  } catch {
    const fallback = await prisma.role.findFirst({
      where: {
        name: "user",
        level: 2,
      },
    });

    if (!fallback) throw new Error("Default role tidak bisa dibuat");
    return fallback;
  }
}

export async function upsertOAuthUser(params: {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string;
  avatar?: string | null;
  tokens?: OAuthTokenInput;
}) {
  const role = await ensureDefaultRole();

  const now = new Date();
  const expiresAt =
    params.tokens?.expiresAt != null
      ? Math.floor(params.tokens.expiresAt)
      : undefined;

  const accountExisting = await prisma.account.findFirst({
    where: {
      provider: params.provider,
      provider_account_id: params.providerAccountId,
    },
    include: {
      user: {
        include: {
          role: true,
        },
      },
    },
  });

  if (accountExisting) {
    const [account, user] = await prisma.$transaction([
      prisma.account.update({
        where: { id: accountExisting.id },
        data: {
          access_token: params.tokens?.accessToken,
          refresh_token: params.tokens?.refreshToken,
          expires_at: expiresAt,
          token_type: params.tokens?.tokenType,
          scope: params.tokens?.scope,
          id_token: params.tokens?.idToken,
        },
      }),
      prisma.user.update({
        where: { id: accountExisting.user_id },
        data: {
          lastLoginAt: now,
          name: params.name,
          avatarUrl: params.avatar ?? accountExisting.user.avatarUrl,
          emailVerifiedAt: accountExisting.user.emailVerifiedAt ?? now,
        },
        include: {
          role: true,
          quota: true,
        },
      }),
    ]);

    return { account, user, role, quota: user.quota };
  }

  const userByEmail = await prisma.user.findUnique({
    where: { email: params.email },
    include: {
      role: true,
      quota: true,
    },
  });

  if (userByEmail) {
    const [account, user] = await prisma.$transaction([
      prisma.account.create({
        data: {
          user_id: userByEmail.id,
          type: "oauth",
          provider: params.provider,
          provider_account_id: params.providerAccountId,
          access_token: params.tokens?.accessToken,
          refresh_token: params.tokens?.refreshToken,
          expires_at: expiresAt,
          token_type: params.tokens?.tokenType,
          scope: params.tokens?.scope,
          id_token: params.tokens?.idToken,
        },
      }),
      prisma.user.update({
        where: { id: userByEmail.id },
        data: {
          lastLoginAt: now,
          name: params.name,
          avatarUrl: params.avatar ?? userByEmail.avatarUrl,
          emailVerifiedAt: userByEmail.emailVerifiedAt ?? now,
        },
        include: {
          role: true,
          quota: true,
        },
      }),
    ]);

    return { account, user, role, quota: user.quota };
  }

  const passwordHash = await generateHashPassword(generateRandomPassword());
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: params.name,
        email: params.email,
        avatarUrl: params.avatar ?? null,
        role_id: role.id,
        emailVerifiedAt: now,
        password: passwordHash,
        lastLoginAt: now,
        isActive: true,
        apiKey: generateApiKey(),
        apiKeyCreatedAt: new Date(),
      },
      include: {
        role: true,
      },
    });

    const quota = await tx.userQuota.create({
      data: {
        userId: user.id,
        quotaBytes: 1024 * 1024 * 1024 * 10, // default create 10 GB
        quotaRequests: 1000, // default create 1000 requests
        usedBytes: 0,
        usedRequests: 0,
        createdAt: now,
        updatedAt: now,
      },
    });

    const account = await tx.account.create({
      data: {
        user_id: user.id,
        type: "oauth",
        provider: params.provider,
        provider_account_id: params.providerAccountId,
        access_token: params.tokens?.accessToken,
        refresh_token: params.tokens?.refreshToken,
        expires_at: expiresAt,
        token_type: params.tokens?.tokenType,
        scope: params.tokens?.scope,
        id_token: params.tokens?.idToken,
      },
    });

    return { account, user, role, quota };
  });

  const userWithSubscription = await prisma.user.findUnique({
    where: { id: result.user.id },
    include: {
      role: true,
    },
  });

  return { account: result.account, user: userWithSubscription, role };
}
