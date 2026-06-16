import type { H3Event } from "h3";

// =====================================================================
// Quota controller (Fase 7) — limit bandwidth/request per user.
// Tanpa plan/billing; penambahan kuota dilakukan admin.
// =====================================================================

const GB = 1024 * 1024 * 1024;

function num(v: bigint | null | undefined): number | null {
  return v == null ? null : Number(v);
}

type QuotaRow = {
  quotaBytes: bigint | null;
  quotaRequests: bigint | null;
  usedBytes: bigint;
  usedRequests: bigint;
  updatedAt: Date;
} | null;

function buildQuotaView(q: QuotaRow) {
  const quotaBytes = q ? num(q.quotaBytes) : null;
  const quotaRequests = q ? num(q.quotaRequests) : null;
  const usedBytes = q ? Number(q.usedBytes) : 0;
  const usedRequests = q ? Number(q.usedRequests) : 0;
  return {
    quotaBytes,
    quotaRequests,
    usedBytes,
    usedRequests,
    quotaGb:
      quotaBytes != null ? Math.round((quotaBytes / GB) * 100) / 100 : null,
    usedGb: Math.round((usedBytes / GB) * 1000) / 1000,
    unlimitedBandwidth: quotaBytes == null,
    unlimitedRequests: quotaRequests == null,
    quotaUpdatedAt: q?.updatedAt ?? null,
  };
}

/** GET /api/user/quota — kuota & pemakaian user saat ini. */
export const getMyQuotaHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: { code: "USER_NOT_LOGGED_IN", message: "User not logged in" },
      });
    }

    const q = await prisma.userQuota.findUnique({
      where: { userId: currentUser.id },
    });
    // Tanpa baris quota = unlimited (default).
    return { success: true, message: "OK", data: buildQuotaView(q) };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/** PATCH /api/user/:id/quota — admin set kuota / reset pemakaian. */
export const setUserQuotaHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);

    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing id",
        data: { code: "MISSING_ID", message: "User id wajib ada." },
      });
    }

    const body = setQuotaSchema.safeParse(await readBody(event));
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

    const exists = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw createError({
        statusCode: 404,
        statusMessage: "User not found",
        data: { code: "USER_NOT_FOUND", message: "User tidak ditemukan." },
      });
    }

    const { quotaGb, quotaRequests, resetUsed } = body.data;
    const fields: Record<string, unknown> = {};
    if (quotaGb !== undefined) {
      fields.quotaBytes =
        quotaGb === null ? null : BigInt(Math.round(quotaGb * GB));
    }
    if (quotaRequests !== undefined) {
      fields.quotaRequests =
        quotaRequests === null ? null : BigInt(quotaRequests);
    }
    if (resetUsed) {
      fields.usedBytes = BigInt(0);
      fields.usedRequests = BigInt(0);
    }

    const updated = await prisma.userQuota.upsert({
      where: { userId: id },
      create: { userId: id, ...fields },
      update: fields,
    });

    // Invalidate cache enforcement gateway
    await cacheDel(`gw:quota:${id}`);

    return {
      success: true,
      message: "Kuota diperbarui.",
      data: buildQuotaView(updated),
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
