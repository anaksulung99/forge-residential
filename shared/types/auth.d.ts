import type { User as UserModel, Role } from "@prisma/client";

declare module "#auth-utils" {
  interface User {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    role_id: string;
    timezone: string | null;
    isActive: boolean;
    emailVerified: boolean;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    lastLoginIp: string | null;
    oauthProvider: string | null;
    oauthProviderId: string | null;
    apiKey: string | null;
    apiKeyCreatedAt: Date | null;
    quotaBytes?: number;
    quotaRequests?: number;
    usedBytes: number;
    usedRequests: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    role: Role;
  }

  interface UserSession {
    user: User;
    loggedInAt?: string;
    provider?: "email" | "github" | "google";
  }
}

export { UserSession, User };
