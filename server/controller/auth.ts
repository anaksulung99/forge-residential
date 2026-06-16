import type { H3Event, H3Error } from "h3";

export const registerHandler = async (event: H3Event) => {
  try {
    const baseConfig = await getSetupConfig();
    if (!baseConfig.enable_register) {
      throw createError({
        statusCode: 403,
        statusMessage: "Registration is disabled",
        data: {
          code: "REGISTRATION_DISABLED",
          message: "Registration is disabled",
        },
      });
    }

    const { clientIp: ip } = await getAllHeaderIdentifiers(event);
    if (!checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000))
      throw createError({
        statusCode: 429,
        statusMessage: "Too many attempts. Try again in 15 minutes.",
        data: {
          code: "RATE_LIMIT",
        },
      });

    const body = registerSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: body.error.issues.map((e) => e.message).join(", "),
        data: {
          code: "VALIDATION_ERROR",
          message: body.error.issues.map((e) => e.message).join(", "),
        },
      });
    }
    const role = await ensureDefaultRole();
    const roleId = role.id;

    const email = body.data.email.toLowerCase().trim();
    const name = body.data.name.trim();

    const passwordHash = await generateHashPassword(body.data.password);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: "Email already registered",
        data: {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "Email already registered",
        },
      });
    }

    const { user, quota } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash: passwordHash,
          name,
          timezone: getTimezone(event).timezone,
          role_id: roleId,
          isActive: true,
          emailVerified: false,
          apiKey: generateApiKey(),
          apiKeyCreatedAt: new Date(),
        },
      });

      await tx.account.create({
        data: {
          user_id: newUser.id,
          type: "email",
          provider: "email",
          provider_account_id: newUser.id,
        },
      });

      const quota = await tx.userQuota.create({
        data: {
          userId: newUser.id,
          quotaBytes: 1024 * 1024 * 1024 * 10, // default create 10 GB
          quotaRequests: 1000, // default create 1000 requests
          usedBytes: 0,
          usedRequests: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "register",
          resource: "user",
          resourceId: newUser.id,
          ipAddress: ip,
          userAgent: getHeader(event, "user-agent") || null,
        },
      });

      return {
        user: newUser,
        quota,
      };
    });

    if (user.emailVerifiedAt) {
      await setUserSession(event, {
        user: buildSessionUser(user, {
          timezone: getTimezone(event).timezone,
          role,
          quota,
        }),
        provider: "email",
        loggedInAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: "User registered successfully",
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role_id: user.role_id,
        },
      };
    }

    const token = generateToken(32);
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        expires,
      },
    });

    const config = useRuntimeConfig();
    const baseUrl =
      config.public.PublicSiteUrl ||
      config.PublicSiteUrl ||
      "http://localhost:3000";

    const url = `${baseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;

    try {
      await sendEmailVerificationEmail(user, url, config.public.PublicSiteUrl);
    } catch (err) {
      console.error(err);
    }

    return {
      success: true,
      message:
        "User registered successfully. please verify your email address.",
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role_id: user.role_id,
      },
    };
  } catch (err) {
    throw handleRequestError(err);
  }
};
export const loginHandler = async (event: H3Event) => {
  try {
    const { clientIp, userAgent, locationClient } =
      await getAllHeaderIdentifiers(event);

    if (!checkRateLimit(`login:${clientIp}`, 10, 15 * 60 * 1000)) {
      throw createError({
        statusCode: 429,
        statusMessage: "Too many requests, please try again later",
        data: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        },
      });
    }

    const body = loginSchema.safeParse(await readBody(event));

    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: body.error.issues
          .map((issue) => issue.message)
          .join(", "),
        data: {
          code: "INVALID_REQUEST",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const password = body.data.password;

    const user = await prisma.user.findUnique({
      where: { email: body.data.email },
      include: { role: true, quota: true },
    });

    if (!user || !user.passwordHash) {
      throw createError({
        statusCode: 401,
        statusMessage: "Email or password incorrect",
        data: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password incorrect",
        },
      });
    }

    if (!user?.isActive) {
      throw createError({
        statusCode: 403,
        statusMessage: "Account is disabled",
        data: {
          code: "ACCOUNT_DISABLED",
          message: "Account is disabled",
        },
      });
    }

    if (!user.emailVerifiedAt) {
      throw createError({
        statusCode: 403,
        statusMessage: "Email not confirmed",
        data: {
          code: "EMAIL_NOT_VERIFIED",
          message: "Email not confirmed",
        },
      });
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      throw createError({
        statusCode: 401,
        statusMessage: "Invalid login credentials",
        data: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid login credentials",
        },
      });
    }

    const now = new Date();

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "login",
        resource: "user",
        resourceId: user.id,
        ipAddress: clientIp,
        userAgent,
      },
    });

    await setUserSession(event, {
      user: buildSessionUser(user, {
        timezone: getTimezone(event).timezone,
        role: user.role,
      }),
      provider: "email",
      loggedInAt: now.toISOString(),
    });

    const config = useRuntimeConfig();
    const baseUrl = config.public.PublicSiteUrl || "http://localhost:3000";

    try {
      await sendSuspiciousActivityEmail(
        user,
        {
          type: "login",
          ip: clientIp,
          userAgent,
          location: locationClient,
          timestamp: now,
          secureUrl: `${baseUrl}/login`,
        },
        baseUrl,
      );
    } catch (error) {
      console.error(error);
    }
    // Return redirect URL instead of sendRedirect to avoid race conditions with session sync
    const redirectTo = (getQuery(event).redirect as string) || "/app";
    return { redirectTo };
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const resendEmailHandler = async (
  event: H3Event,
): Promise<H3Error | void> => {
  try {
    const { clientIp } = await getAllHeaderIdentifiers(event);
    if (!checkRateLimit(`resend-email:${clientIp}`, 10, 15 * 60 * 1000)) {
      throw createError({
        statusCode: 429,
        statusMessage: "Too many requests, please try again later",
        data: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        },
      });
    }

    const body = forgotPasswordSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: body.error.issues
          .map((issue) => issue.message)
          .join(", "),
        data: {
          code: "INVALID_REQUEST",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const query = getQuery(event);

    const email = body.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
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
    if (!user.isActive) {
      throw createError({
        statusCode: 403,
        statusMessage: "Account is disabled",
        data: {
          code: "ACCOUNT_DISABLED",
          message: "Account is disabled",
        },
      });
    }
    if (user.emailVerifiedAt) {
      throw createError({
        statusCode: 403,
        statusMessage: "Email already confirmed",
        data: {
          code: "EMAIL_ALREADY_VERIFIED",
          message: "Email already confirmed",
        },
      });
    }

    const token = generateToken(32);
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        expires,
      },
    });

    const config = useRuntimeConfig();
    const baseUrl =
      config.public.PublicSiteUrl ||
      config.PublicSiteUrl ||
      "http://localhost:3000";
    const url = `${baseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;

    try {
      await sendResendVerificationEmail(user, url, config.public.PublicSiteUrl);
    } catch (err) {
      console.error(err);
    }
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const forgotHandler = async (
  event: H3Event,
): Promise<H3Error | void> => {
  try {
    const { clientIp: ip } = await getAllHeaderIdentifiers(event);
    if (!checkRateLimit(`forgot:${ip}`, 10, 15 * 60 * 1000)) {
      throw createError({
        statusCode: 429,
        statusMessage: "Too many requests, please try again later",
        data: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        },
      });
    }

    const body = forgotPasswordSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: body.error.issues
          .map((issue) => issue.message)
          .join(", "),
        data: {
          code: "INVALID_REQUEST",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const email = body.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found or account is disabled",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found or account is disabled",
        },
      });
    }

    const token = generateToken(32);
    const expires = new Date(Date.now() + 1000 * 60 * 60);

    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false },
    });

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expires,
        used: false,
      },
    });

    const config = useRuntimeConfig();
    const baseUrl =
      config.public.PublicSiteUrl ||
      config.PublicSiteUrl ||
      "http://localhost:3000";
    const url = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await sendForgotPasswordEmail(user, url, config.public.PublicSiteUrl);
    } catch (err) {
      console.error(err);
    }
  } catch (error) {
    throw handleRequestError(error);
  }
};
export const verifyEmailHandler = async (event: H3Event) => {
  try {
    const body = verifyEmailSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid input",
        data: {
          code: "INVALID_REQUEST",
          message: body.error.issues.map((issue) => issue.message).join(", "),
        },
      });
    }

    const token = body.data.token.trim();
    const query = getQuery(event);

    const verification = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verification || verification.expires.getTime() < Date.now()) {
      throw createError({
        statusCode: 400,
        statusMessage: "Verification link is invalid or has expired",
        data: {
          code: "VERIFICATION_LINK_INVALID",
          message: "Verification link is invalid or has expired",
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: verification.identifier },
    });

    if (!user) {
      throw createError({
        statusCode: 400,
        statusMessage: "User not found",
        data: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          isActive: true,
        },
        include: {
          role: true,
          quota: true,
        },
      });
      await tx.verificationToken.delete({
        where: { token },
      });

      return { user: newUser };
    });

    await setUserSession(event, {
      user: buildSessionUser(result.user, {
        timezone: getTimezone(event).timezone,
        role: result.user.role,
      }),
      provider: "email",
      loggedInAt: new Date().toISOString(),
    });

    const redirectUrl = "/app";

    return {
      success: true,
      message: "Email verified successfully.",
      data: {
        redirectUrl,
      },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
