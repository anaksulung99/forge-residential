import type { H3Event } from "h3";

// =====================================================================
// Pool controller (Fase 5) — manajemen rotating pool & kredensial gateway
// =====================================================================

function requireUser(session: { user?: { id: string } | null }) {
  if (!session.user) {
    throw createError({
      statusCode: 401,
      statusMessage: "User not logged in",
      data: { code: "USER_NOT_LOGGED_IN", message: "User not logged in" },
    });
  }
  return session.user;
}

/** GET /api/pools — daftar pool + jumlah member (total & active). */
export const listPoolsHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const user = requireUser(session);

    await ensureDefaultPools(user.id);

    const pools = await prisma.proxyPool.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { members: true } } },
    });

    // Hitung member aktif per pool dalam 1 query
    const activeGroups = await prisma.proxyPoolMember.groupBy({
      by: ["poolId"],
      where: {
        enabled: true,
        pool: { userId: user.id },
        proxy: { status: "active", deletedAt: null },
      },
      _count: { _all: true },
    });
    const activeMap = new Map(
      activeGroups.map((g) => [g.poolId, g._count._all]),
    );

    const data = pools.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      isDefault: p.isDefault,
      isActive: p.isActive,
      rotationMode: p.rotationMode,
      stickyTtlSec: p.stickyTtlSec,
      filterCountry: p.filterCountry,
      filterProtocol: p.filterProtocol,
      gatewayUsername: p.gatewayUsername,
      gatewayPassword: p.gatewayPassword,
      totalMembers: p._count.members,
      activeMembers: activeMap.get(p.id) ?? 0,
      createdAt: p.createdAt,
    }));

    return { success: true, message: "OK", data };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/** POST /api/pools — buat pool kustom. */
export const createPoolHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const user = requireUser(session);

    const body = createPoolSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid data",
        data: {
          code: "VALIDATION_ERROR",
          message: body.error.issues.map((i) => i.message).join(", "),
        },
      });
    }

    const { username, password } = genGatewayCredentials(
      body.data.category === "MOBILE_ROTATING" ? "mob" : "res",
    );

    const pool = await prisma.proxyPool.create({
      data: {
        name: body.data.name,
        category: body.data.category,
        rotationMode: body.data.rotationMode,
        stickyTtlSec: body.data.stickyTtlSec ?? null,
        gatewayUsername: username,
        gatewayPassword: password,
        userId: user.id,
      },
    });

    return { success: true, message: "Pool dibuat.", data: { id: pool.id } };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/** PATCH /api/pools/:id — ubah pengaturan pool. */
export const updatePoolHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const user = requireUser(session);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing id",
        data: { code: "MISSING_ID", message: "Pool id wajib ada." },
      });
    }

    const body = updatePoolSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid data",
        data: {
          code: "VALIDATION_ERROR",
          message: body.error.issues.map((i) => i.message).join(", "),
        },
      });
    }

    const result = await prisma.proxyPool.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: body.data,
    });
    if (result.count === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Pool not found",
        data: { code: "POOL_NOT_FOUND", message: "Pool tidak ditemukan." },
      });
    }

    return { success: true, message: "Pool diperbarui.", data: { id } };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/** POST /api/pools/:id/regenerate — buat ulang kredensial gateway. */
export const regeneratePoolCredsHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const user = requireUser(session);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing id",
        data: { code: "MISSING_ID", message: "Pool id wajib ada." },
      });
    }

    const pool = await prisma.proxyPool.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true, category: true },
    });
    if (!pool) {
      throw createError({
        statusCode: 404,
        statusMessage: "Pool not found",
        data: { code: "POOL_NOT_FOUND", message: "Pool tidak ditemukan." },
      });
    }

    const { username, password } = genGatewayCredentials(
      pool.category === "MOBILE_ROTATING" ? "mob" : "res",
    );
    await prisma.proxyPool.update({
      where: { id: pool.id },
      data: { gatewayUsername: username, gatewayPassword: password },
    });

    return {
      success: true,
      message: "Kredensial gateway diperbarui.",
      data: { gatewayUsername: username, gatewayPassword: password },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/** DELETE /api/pools/:id — soft delete pool kustom (default tak boleh). */
export const deletePoolHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const user = requireUser(session);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing id",
        data: { code: "MISSING_ID", message: "Pool id wajib ada." },
      });
    }

    const pool = await prisma.proxyPool.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true, isDefault: true },
    });
    if (!pool) {
      throw createError({
        statusCode: 404,
        statusMessage: "Pool not found",
        data: { code: "POOL_NOT_FOUND", message: "Pool tidak ditemukan." },
      });
    }
    if (pool.isDefault) {
      throw createError({
        statusCode: 400,
        statusMessage: "Cannot delete default pool",
        data: {
          code: "POOL_IS_DEFAULT",
          message: "Pool default tidak bisa dihapus.",
        },
      });
    }

    await prisma.proxyPool.update({
      where: { id: pool.id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: "Pool dihapus.", data: { id } };
  } catch (error) {
    throw handleRequestError(error);
  }
};
