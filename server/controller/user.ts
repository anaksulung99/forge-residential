import type { H3Event } from "h3";

export const getUserHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: "User tidak ditemukan",
        data: {
          code: "USER_NOT_FOUND",
          message: "User tidak ditemukan",
        },
      });
    }

    user.passwordHash = null;

    return user;
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const updateAvatarHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const body = updateAvatarOnlySchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid avatar URL",
        data: {
          code: "INVALID_AVATAR_URL",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        avatarUrl: body.data.avatar,
      },
      include: {
        role: true,
        quota: true,
      },
    });

    updatedUser.passwordHash = null;
    const { locationClient } = await getAllHeaderIdentifiers(event);

    await setUserSession(event, {
      ...session,
      user: buildSessionUser(updatedUser, {
        timezone: locationClient?.timezone || "Asia/Jakarta",
      }),
      provider: session.provider,
      loggedInAt: session.loggedInAt,
    });

    return {
      success: true,
      message: "Avatar updated successfully",
      data: {
        avatarUrl: updatedUser.avatarUrl,
      },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const updateProfileHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const body = updateProfileSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid profile data",
        data: {
          code: "INVALID_PROFILE_DATA",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name: body.data.name,
        avatarUrl: body.data.avatar,
      },
      include: {
        role: true,
        quota: true,
      },
    });

    updatedUser.passwordHash = null;
    const { locationClient } = await getAllHeaderIdentifiers(event);

    await setUserSession(event, {
      ...session,
      user: buildSessionUser(updatedUser, {
        timezone: locationClient?.timezone || "Asia/Jakarta",
      }),
      provider: session.provider,
      loggedInAt: session.loggedInAt,
    });

    return {
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const changePasswordHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const body = changePasswordSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid password data",
        data: {
          code: "INVALID_PASSWORD_DATA",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }
    if (!user.passwordHash) {
      throw createError({
        statusCode: 400,
        statusMessage: "User doesn't have password hash",
        data: {
          code: "USER_NOT_HAS_PASSWORD_HASH",
          message: "User doesn't have password hash",
        },
      });
    }

    if (
      !(await comparePassword(body.data.currentPassword, user.passwordHash))
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "Current password is incorrect",
        data: {
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "Current password is incorrect",
        },
      });
    }
    const newHash = await generateHashPassword(body.data.newPassword);
    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash: newHash,
      },
    });

    const config = useRuntimeConfig();
    const { clientIp, userAgent, locationClient } =
      await getAllHeaderIdentifiers(event);
    try {
      sendPasswordResetSuccessEmail(user, config.public.PublicSiteUrl);
      sendSuspiciousActivityEmail(
        user,
        {
          type: "change_password",
          ip: clientIp,
          userAgent,
          location: locationClient,
          timestamp: new Date(),
          secureUrl: "/login",
        },
        config.public.PublicSiteUrl,
      );
    } catch (error) {
      console.error(error);
    }

    clearUserSession(event);

    return {
      success: true,
      message: "Password changed successfully",
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const deleteAccountHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const exist = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });
    if (!exist) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    if (!exist.isActive) {
      throw createError({
        statusCode: 400,
        statusMessage: "User is not active",
        data: {
          code: "USER_NOT_ACTIVE",
          message: "User not active",
        },
      });
    }

    await prisma.user.delete({
      where: { id: currentUser.id },
      include: {
        accounts: true,
        systemLogs: true,
        auditLogs: true,
        passwordResetTokens: true,
        quota: true,
      },
    });

    const config = useRuntimeConfig();

    try {
      await sendAccountDeletingRequestEmail(exist, config.public.PublicSiteUrl);
    } catch (error) {
      console.error(error);
    }
    return {
      success: true,
      message: "Account deleted successfully",
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const listUser = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    const rawQuery = getQuery(event);
    const query = listUserQuerySchema.parse({
      page: rawQuery.page,
      limit: rawQuery.limit,
      status: rawQuery.status,
      search: rawQuery.search,
      orderBy: rawQuery.orderBy,
      order: rawQuery.order,
      role: rawQuery.role,
    });
    const skip = (query.page - 1) * query.limit;

    const where: any = {
      deletedAt: null,
    };

    if (query.status) where.isActive = query.status === "active" ? true : false;
    if (query.role)
      where.role = {
        name: query.role,
      };
    if (query.search)
      where.OR = [
        { email: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ];

    const orderBy: any = { [query.orderBy || "id"]: query.order };

    const [users, total] = await Promise.all([
      await prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        include: {
          role: true,
          quota: true,
        },
      }),
      await prisma.user.count({
        where,
      }),
    ]);

    const serializedUsers = users.map((user) => ({
      ...user,
      quota: {
        ...user.quota,
        quotaBytes: safeSerialize(user.quota?.quotaBytes || 0),
        quotaRequests: safeSerialize(user.quota?.quotaRequests || 0),
        usedBytes: safeSerialize(user.quota?.usedBytes || 0),
        usedRequests: safeSerialize(user.quota?.usedRequests || 0),
      },
    }));

    return {
      success: true,
      message: "Users listed successfully",
      data: serializedUsers,
      meta: {
        total: Number(total),
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(Number(total) / query.limit),
        has_more: Number(total) > skip + query.limit,
      },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const assignRoleHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const userId = getRouterParam(event, "id")!;
    if (userId === currentUser.id) {
      throw createError({
        statusCode: 400,
        statusMessage: "You can't assign role to yourself",
        data: {
          code: "CANNOT_ASSIGN_ROLE_TO_SELF",
          message: "You can't assign role to yourself",
        },
      });
    }

    if (
      currentUser.role.name === "superadmin" ||
      currentUser.role.level === 0
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "You can't assign role to admin or superadmin",
        data: {
          code: "CANNOT_ASSIGN_ROLE_ADMIN_OR_SUPERADMIN",
          message: "You can't assign role to admin or superadmin",
        },
      });
    }

    const body = assignRoleSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid role data",
        data: {
          code: "INVALID_ROLE_DATA",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.isActive) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found or inactive status",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found or inactive status",
        },
      });
    }

    const role = await prisma.role.findFirst({
      where: { name: body.data.role },
    });
    if (!role) {
      throw createError({
        statusCode: 404,
        statusMessage: "Role not found",
        data: {
          code: "ROLE_NOT_FOUND",
          message: "Role not found",
        },
      });
    }

    if (user.role_id === role.id) {
      throw createError({
        statusCode: 400,
        statusMessage: "User already has this role",
        data: {
          code: "USER_ALREADY_HAS_ROLE",
          message: "User already has this role",
        },
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        role_id: role.id,
      },
    });

    return {
      success: true,
      message: "Role assigned successfully",
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const setStatusActiveHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const userId = getRouterParam(event, "id")!;
    if (userId === currentUser.id) {
      throw createError({
        statusCode: 400,
        statusMessage: "You can't set active status to yourself",
        data: {
          code: "CANNOT_SET_ACTIVE_STATUS_TO_SELF",
          message: "You can't set active status to yourself",
        },
      });
    }

    if (
      currentUser.role.name === "superadmin" ||
      currentUser.role.level === 0
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "You can't set active status to admin or superadmin",
        data: {
          code: "CANNOT_SET_ACTIVE_STATUS_ADMIN_OR_SUPERADMIN",
          message: "You can't set active status to admin or superadmin",
        },
      });
    }

    const body = setStatusActiveSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid active data",
        data: {
          code: "INVALID_ACTIVE_DATA",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: body.data.status === "active" ? true : false,
      },
    });

    const config = useRuntimeConfig();

    if (body.data.status === "inactive") {
      try {
        await sendSuspendAccountEmail(user, config.public.PublicSiteUrl);
      } catch (error) {
        console.error(error);
      }
    }

    return {
      success: true,
      message: "Set active user status successfully",
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const deleteUserHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: {
          code: "USER_NOT_LOGGED_IN",
          message: "User not logged in",
        },
      });
    }

    const userId = getRouterParam(event, "id")!;
    if (userId === currentUser.id) {
      throw createError({
        statusCode: 400,
        statusMessage: "You can't delete yourself",
        data: {
          code: "CANNOT_DELETE_SELF",
          message: "You can't delete yourself",
        },
      });
    }

    if (
      currentUser.role.name === "superadmin" ||
      currentUser.role.level === 0
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "You can't delete admin or superadmin",
        data: {
          code: "CANNOT_DELETE_ADMIN_OR_SUPERADMIN",
          message: "You can't delete admin or superadmin",
        },
      });
    }

    await prisma.user.delete({
      where: { id: userId },
      include: {
        accounts: true,
        systemLogs: true,
        auditLogs: true,
        passwordResetTokens: true,
      },
    });

    const config = useRuntimeConfig();

    try {
      if (currentUser) {
        await sendPermanentlyDeleteAccountEmail(
          currentUser,
          config.public.PublicSiteUrl,
        );
      }
    } catch (error) {
      console.error(error);
    }

    return {
      success: true,
      message: "User deleted successfully",
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const inviteUserHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    const body = inviteUserSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid invite data",
        data: {
          code: "INVALID_INVITE_DATA",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }
    const existUser = await prisma.user.findUnique({
      where: { email: body.data.email },
    });

    if (existUser) {
      throw createError({
        statusCode: 404,
        statusMessage: "User already exists",
        data: {
          code: "USER_ALREADY_EXISTS",
          message: "User already exists",
        },
      });
    }

    const existRole = await prisma.role.findFirst({
      where: { name: "user" },
    });

    if (!existRole) {
      throw createError({
        statusCode: 404,
        statusMessage: "Role not found",
        data: {
          code: "ROLE_NOT_FOUND",
          message: "Role not found",
        },
      });
    }

    const ip = getClientIp(event);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: body.data.email,
          passwordHash: await generateHashPassword(body.data.password),
          name: body.data.name,
          timezone: getTimezone(event).timezone,
          role_id: existRole.id,
          isActive: body.data.isActive,
          apiKey: generateApiKey(),
          apiKeyCreatedAt: new Date(),
          emailVerified: body.data.emailVerified,
        },
      });

      await tx.userQuota.create({
        data: {
          userId: newUser.id,
          quotaBytes: body.data.quotaBytes || 1024 * 1024 * 1024 * 10, // default create 10 GB
          quotaRequests: body.data.quotaRequests || 1000, // default create 1000 requests
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "invite_user",
          resource: "user",
          resourceId: newUser.id,
          ipAddress: ip,
          userAgent: getHeader(event, "user-agent") || null,
        },
      });

      return newUser;
    });

    const config = useRuntimeConfig();
    try {
      await sendIviteUserEmail(
        user,
        config.public.PublicSiteUrl,
        body.data.password,
        config.public.SupportEmail,
      );
    } catch (err) {
      console.error(err);
    }

    return {
      success: true,
      message: "User invited successfully",
      user,
    };
  } catch (err) {
    throw handleRequestError(err);
  }
};
export const getUserByIdHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    const userId = getRouterParam(event, "id")!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        quota: true,
        accounts: true,
        systemLogs: true,
        auditLogs: true,
        passwordResetTokens: true,
      },
    });

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    return {
      success: true,
      message: "User fetched successfully",
      user: user,
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const updateUserByIdHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    const userId = getRouterParam(event, "id")!;

    const existUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existUser) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    if (!existUser.isActive) {
      throw createError({
        statusCode: 400,
        statusMessage: "User is not active",
        data: {
          code: "USER_IS_NOT_ACTIVE",
          message: "User is not active",
        },
      });
    }

    const body = updateUserSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid update data",
        data: {
          code: "INVALID_UPDATE_DATA",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const email = body.data.email || existUser.email;

    if (email !== existUser.email) {
      const existingUserWithEmail = await prisma.user.findFirst({
        where: {
          email: email,
          id: { not: userId }, // exclude current user
        },
      });

      if (existingUserWithEmail) {
        throw createError({
          statusCode: 400,
          statusMessage: "Email already used",
          data: {
            code: "EMAIL_ALREADY_EXISTS",
            message: `Email "${email}" is already used by another user`,
          },
        });
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.update({
        where: { id: userId },
        data: {
          name: body.data.name,
          email: email, // gunakan email yang sudah dicek
          isActive: body.data.isActive,
          emailVerified: body.data.emailVerified,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "update_user",
          resource: "user",
          resourceId: newUser.id,
          userAgent: getHeader(event, "user-agent") || null,
        },
      });

      return {
        user: newUser,
      };
    });

    return {
      success: true,
      message: "User updated successfully",
      user: user.user,
    };
  } catch (err) {
    throw handleRequestError(err);
  }
};
export const bulkDeleteUserHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    const body = await readBody(event);
    if (!body) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid delete data",
        data: {
          code: "INVALID_DELETE_DATA",
          message: "Invalid delete data",
        },
      });
    }
    if (!Array.isArray(body.userIds)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid delete data",
        data: {
          code: "INVALID_DELETE_DATA",
          message: "Invalid delete data",
        },
      });
    }
    const userIds = body.userIds as string[];

    await prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({
        where: {
          id: {
            in: userIds,
          },
          role: {
            name: {
              notIn: ["admin", "superadmin"],
            },
          },
        },
      });
      await tx.userQuota.deleteMany({
        where: {
          userId: {
            in: userIds,
          },
          user: {
            role: {
              name: {
                notIn: ["admin", "superadmin"],
              },
            },
          },
        },
      });
      await tx.account.deleteMany({
        where: {
          user_id: {
            in: userIds,
          },
          user: {
            role: {
              name: {
                notIn: ["admin", "superadmin"],
              },
            },
          },
        },
      });
      await tx.systemLog.deleteMany({
        where: {
          userId: {
            in: userIds,
          },
        },
      });
      await tx.auditLog.deleteMany({
        where: {
          userId: {
            in: userIds,
          },
          user: {
            role: {
              name: {
                notIn: ["admin", "superadmin"],
              },
            },
          },
        },
      });
      await tx.passwordResetToken.deleteMany({
        where: {
          userId: {
            in: userIds,
          },
          user: {
            role: {
              name: {
                notIn: ["admin", "superadmin"],
              },
            },
          },
        },
      });
    });

    return {
      success: true,
      message: "Users deleted successfully",
    };
  } catch (err) {
    throw handleRequestError(err);
  }
};
export const cleanUpUserHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    await prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({
        where: {
          deletedAt: {
            not: null,
          },
        },
      });
    });

    return {
      success: true,
      message: "Users cleaned up successfully",
    };
  } catch (err) {
    throw handleRequestError(err);
  }
};
