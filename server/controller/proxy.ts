import type { H3Event } from "h3";
import type { Prisma } from "@prisma/client";

// =====================================================================
// Proxy controller (Fase 1) — import & list
// =====================================================================

/**
 * POST /api/proxies/import
 * Terima teks mentah daftar proxy → parse, dedup (batch + DB), simpan status pending.
 * Klasifikasi mobile/residential & pengecekan liveness dilakukan di fase berikutnya.
 */
export const importProxiesHandler = async (event: H3Event) => {
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

    const body = importProxiesSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid import data",
        data: {
          code: "VALIDATION_ERROR",
          message: body.error.issues.map((i) => i.message).join(", "),
        },
      });
    }

    const { raw, defaultProtocol, sourceLabel } = body.data;
    const parsed = parseProxyList(raw, defaultProtocol);

    if (parsed.valid.length === 0) {
      return {
        success: true,
        message: "Tidak ada proxy valid yang ditemukan.",
        data: {
          found: 0,
          imported: 0,
          batchDuplicates: parsed.duplicates,
          dbDuplicates: 0,
          invalid: parsed.invalid,
        },
      };
    }

    // Dedup terhadap proxy yang sudah ada milik user ini
    const hosts = [...new Set(parsed.valid.map((p) => p.host.toLowerCase()))];
    const existing = await prisma.proxy.findMany({
      where: { userId: currentUser.id, host: { in: hosts } },
      select: { host: true, port: true, protocol: true },
    });
    const existingKeys = new Set(
      existing.map((e) =>
        proxyKey({ host: e.host, port: e.port, protocol: e.protocol }),
      ),
    );

    const toInsert = parsed.valid.filter((p) => !existingKeys.has(proxyKey(p)));
    const dbDuplicates = parsed.valid.length - toInsert.length;

    // Pastikan pool default tersedia (Residential & Mobile)
    await ensureDefaultPools(currentUser.id);

    let imported = 0;
    if (toInsert.length > 0) {
      const label =
        sourceLabel || `Manual import ${new Date().toISOString().slice(0, 10)}`;

      const source = await prisma.proxySource.create({
        data: {
          type: "manual_import",
          label,
          userId: currentUser.id,
        },
      });

      const data: Prisma.ProxyCreateManyInput[] = toInsert.map((p) => ({
        host: p.host,
        port: p.port,
        protocol: p.protocol,
        username: p.username,
        password: p.password,
        userId: currentUser.id,
        sourceId: source.id,
        // category & status default: RESIDENTIAL_ROTATING / pending (diisi ulang saat klasifikasi)
      }));

      const result = await prisma.proxy.createMany({
        data,
        skipDuplicates: true,
      });
      imported = result.count;

      // Auto-antre pengecekan untuk proxy yang baru masuk (best-effort)
      if (imported > 0) {
        try {
          const fresh = await prisma.proxy.findMany({
            where: { sourceId: source.id, status: "pending" },
            select: { id: true },
          });
          const ids = fresh.map((f) => f.id);
          if (ids.length > 0) {
            await prisma.proxy.updateMany({
              where: { id: { in: ids } },
              data: { status: "checking" },
            });
            await enqueueProxyChecks(ids, "fast");
            await publishEvent("queue:update", {
              queue: "proxy-check",
              size: ids.length,
            });
          }
        } catch {
          // Redis/worker belum jalan → biarkan proxy tetap 'pending',
          // user bisa trigger cek manual nanti.
          await prisma.proxy.updateMany({
            where: { sourceId: source.id, status: "checking" },
            data: { status: "pending" },
          });
        }
      }
    }

    return {
      success: true,
      message: `${imported} proxy diimpor.`,
      data: {
        found: parsed.valid.length,
        imported,
        batchDuplicates: parsed.duplicates,
        dbDuplicates,
        invalid: parsed.invalid,
      },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * GET /api/proxies
 * List proxy milik user (paginated + filter status/category/protocol/country/search).
 */
export const listProxiesHandler = async (event: H3Event) => {
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

    const query = listProxiesQuerySchema.safeParse(getQuery(event));
    if (!query.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid query",
        data: {
          code: "VALIDATION_ERROR",
          message: query.error.issues.map((i) => i.message).join(", "),
        },
      });
    }

    const {
      page,
      limit,
      status,
      category,
      protocol,
      country,
      search,
      orderBy,
      order,
    } = query.data;

    const where: Prisma.ProxyWhereInput = {
      userId: currentUser.id,
      deletedAt: null,
      ...(status && { status }),
      ...(category && { category }),
      ...(protocol && { protocol }),
      ...(country && { country: country.toUpperCase() }),
      ...(search && {
        OR: [
          { host: { contains: search, mode: "insensitive" } },
          { asnOrg: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [
      total,
      rows,
      totalProxy,
      activeTotal,
      checkingTotal,
      pendingTotal,
      bannedTotal,
      deadTotal,
    ] = await Promise.all([
      prisma.proxy.count({ where }),
      prisma.proxy.findMany({
        where,
        orderBy: { [orderBy]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.proxy.count({
        where: { userId: currentUser.id, deletedAt: null },
      }),
      prisma.proxy.count({
        where: { userId: currentUser.id, status: "active", deletedAt: null },
      }),
      prisma.proxy.count({
        where: { userId: currentUser.id, status: "checking", deletedAt: null },
      }),
      prisma.proxy.count({
        where: { userId: currentUser.id, status: "pending", deletedAt: null },
      }),
      prisma.proxy.count({
        where: { userId: currentUser.id, status: "banned", deletedAt: null },
      }),
      prisma.proxy.count({
        where: { userId: currentUser.id, status: "dead", deletedAt: null },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      success: true,
      message: "OK",
      data: {
        rows,
        stats: {
          totalProxy,
          activeTotal,
          checkingTotal,
          pendingTotal,
          bannedTotal,
          deadTotal,
        },
      },
      meta: {
        page,
        limit,
        total,
        totalPages,
        has_more: page < totalPages,
      },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * DELETE /api/proxies/:id  — soft delete satu proxy milik user.
 */
export const deleteProxyHandler = async (event: H3Event) => {
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

    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing id",
        data: { code: "MISSING_ID", message: "Proxy id wajib ada." },
      });
    }

    const result = await prisma.proxy.updateMany({
      where: { id, userId: currentUser.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Proxy not found",
        data: { code: "PROXY_NOT_FOUND", message: "Proxy tidak ditemukan." },
      });
    }

    return { success: true, message: "Proxy dihapus.", data: { id } };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * DELETE /api/proxies/bulk  — soft delete banyak proxy sekaligus (body { ids }).
 */
export const bulkDeleteProxiesHandler = async (event: H3Event) => {
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

    const body = bulkDeleteProxiesSchema.safeParse(await readBody(event));
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

    const result = await prisma.proxy.updateMany({
      where: {
        id: { in: body.data.ids },
        userId: currentUser.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      message: `${result.count} proxy dihapus.`,
      data: { deleted: result.count },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * POST /api/proxies/:id/recheck  — fast-check satu proxy & update health-nya.
 */
export const recheckProxyHandler = async (event: H3Event) => {
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

    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing id",
        data: { code: "MISSING_ID", message: "Proxy id wajib ada." },
      });
    }

    const owned = await prisma.proxy.findFirst({
      where: { id, userId: currentUser.id, deletedAt: null },
      select: { id: true },
    });
    if (!owned) {
      throw createError({
        statusCode: 404,
        statusMessage: "Proxy not found",
        data: { code: "PROXY_NOT_FOUND", message: "Proxy tidak ditemukan." },
      });
    }

    const result = await processProxyCheck(id, "fast");
    if (!result) {
      throw createError({
        statusCode: 404,
        statusMessage: "Proxy not found",
        data: { code: "PROXY_NOT_FOUND", message: "Proxy tidak ditemukan." },
      });
    }

    await publishEvent("proxy:update", {
      userId: result.userId,
      proxyId: result.proxyId,
      status: result.status,
    });

    return {
      success: true,
      message: result.ok
        ? `Proxy aktif (${result.latencyMs} ms).`
        : `Proxy mati: ${result.error}`,
      data: result,
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * POST /api/proxies/scrape  — buat ScrapeJob per sumber & antrekan ke worker.
 * body: { sources: string[], country?, protocol?, anonymity? }
 */
export const startScrapeHandler = async (event: H3Event) => {
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

    const body = startScrapeSchema.safeParse(await readBody(event));
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

    const { sources, country, protocol, anonymity } = body.data;
    const filters = { country, protocol, anonymity };

    const jobs: { id: string; source: string }[] = [];
    for (const source of sources) {
      const job = await prisma.scrapeJob.create({
        data: {
          source,
          status: "queued",
          filters,
          userId: currentUser.id,
        },
      });
      jobs.push({ id: job.id, source });
    }

    try {
      await Promise.all(jobs.map((j) => enqueueScrape(j.id)));
    } catch (err) {
      console.error("[startScrape] gagal antre:", err);
      await prisma.scrapeJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: { status: "failed", error: "Queue unavailable" },
      });
      throw createError({
        statusCode: 503,
        statusMessage: "Queue unavailable",
        data: {
          code: "QUEUE_UNAVAILABLE",
          message:
            err instanceof Error
              ? `Gagal mengantre: ${err.message}`
              : "Gagal mengantre — pastikan Redis & worker berjalan.",
        },
      });
    }

    return {
      success: true,
      message: `${jobs.length} job scraping dimulai.`,
      data: { jobs },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * POST /api/proxies/report  — webhook: tester external lapor proxy gagal.
 * Auth: API key (header x-api-key / Authorization: Bearer) atau session.
 * Resolusi proxy: (1) session+poolUsername via map sticky, atau (2) host:port.
 */
export const reportProxyHandler = async (event: H3Event) => {
  try {
    // ── Auth: API key dulu, fallback session ──
    const headerKey =
      getHeader(event, "x-api-key") ||
      getHeader(event, "authorization")
        ?.replace(/^Bearer\s+/i, "")
        .trim();
    let userId: string | null = null;
    if (headerKey) {
      const u = await prisma.user.findUnique({
        where: { apiKey: headerKey },
        select: { id: true },
      });
      if (u) userId = u.id;
    }
    if (!userId) {
      try {
        const session = await getSessionFromContext(event);
        userId = session.user?.id ?? null;
      } catch {
        /* tak ada session */
      }
    }
    if (!userId) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { code: "UNAUTHORIZED", message: "API key / login diperlukan." },
      });
    }

    const body = reportProxySchema.safeParse(await readBody(event));
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
    const { host, port, proxy, protocol, session, poolUsername, dead, reason } =
      body.data;

    // ── Resolve proxyId ──
    let proxyId: string | null = null;

    // (1) via sticky session
    if (session && poolUsername) {
      const pool = await prisma.proxyPool.findFirst({
        where: { gatewayUsername: poolUsername, userId, deletedAt: null },
        select: { id: true },
      });
      if (pool) {
        const pid = await cacheGetJSON<string>(
          `gw:sticky:${pool.id}:${session}`,
        );
        if (pid) proxyId = pid;
      }
    }

    // (2) via host:port langsung
    if (!proxyId) {
      let h = host;
      let p = port;
      if (proxy) {
        const i = proxy.lastIndexOf(":");
        if (i > 0) {
          h = proxy.slice(0, i);
          p = Number(proxy.slice(i + 1));
        }
      }
      if (h && p) {
        const found = await prisma.proxy.findFirst({
          where: {
            userId,
            host: h,
            port: p,
            deletedAt: null,
            ...(protocol ? { protocol } : {}),
          },
          select: { id: true },
        });
        if (found) proxyId = found.id;
      }
    }

    if (!proxyId) {
      throw createError({
        statusCode: 404,
        statusMessage: "Proxy not found",
        data: {
          code: "PROXY_NOT_RESOLVED",
          message: "Proxy tidak ditemukan / tidak bisa di-resolve.",
        },
      });
    }

    await markProxyFailure(proxyId, userId, {
      immediate: dead,
      reason: reason || "reported via webhook",
    });

    return {
      success: true,
      message: dead ? "Proxy ditandai dead." : "Kegagalan dicatat.",
      data: { proxyId, dead },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * GET /api/proxies/scrape  — daftar ScrapeJob terakhir milik user.
 */
export const listScrapeJobsHandler = async (event: H3Event) => {
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

    const jobs = await prisma.scrapeJob.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { success: true, message: "OK", data: jobs };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * POST /api/proxies/check  — antrekan pengecekan ke worker BullMQ.
 * body: { scope: 'selected'|'pending'|'all', ids?: string[], method?: 'fast'|'playwright' }
 */
export const enqueueChecksHandler = async (event: H3Event) => {
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

    const body = enqueueChecksSchema.safeParse(await readBody(event));
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

    const { scope, ids, method } = body.data;

    const where: Prisma.ProxyWhereInput = {
      userId: currentUser.id,
      deletedAt: null,
      ...(scope === "selected" && { id: { in: ids ?? [] } }),
      // 'checking' diikutkan agar proxy yang nyangkut bisa di-recover
      ...(scope === "pending" && {
        status: { in: ["pending", "dead", "checking"] },
      }),
      // scope 'all' → semua milik user
    };

    const targets = await prisma.proxy.findMany({
      where,
      select: { id: true },
      take: 5000,
    });
    const targetIds = targets.map((t) => t.id);

    if (targetIds.length === 0) {
      return {
        success: true,
        message: "Tidak ada proxy untuk dicek.",
        data: { queued: 0 },
      };
    }

    // Tandai 'checking' supaya UI langsung mencerminkan status
    await prisma.proxy.updateMany({
      where: { id: { in: targetIds } },
      data: { status: "checking" },
    });

    try {
      await enqueueProxyChecks(targetIds, method);
    } catch (err) {
      // Redis/worker mati → kembalikan status & beri tahu user
      console.error("[enqueueChecks] gagal antre:", err);
      await prisma.proxy.updateMany({
        where: { id: { in: targetIds } },
        data: { status: "pending" },
      });
      throw createError({
        statusCode: 503,
        statusMessage: "Queue unavailable",
        data: {
          code: "QUEUE_UNAVAILABLE",
          message:
            err instanceof Error
              ? `Gagal mengantre: ${err.message}`
              : "Gagal mengantre — pastikan Redis & worker proxy-check berjalan.",
        },
      });
    }

    await publishEvent("queue:update", {
      queue: "proxy-check",
      size: targetIds.length,
    });

    return {
      success: true,
      message: `${targetIds.length} proxy diantre untuk dicek.`,
      data: { queued: targetIds.length },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

/**
 * POST /api/proxies/clean-up  — hapus semua proxy yang dead.
 */
export const cleanUpProxiesHandler = async (event: H3Event) => {
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

    await prisma.proxy.updateMany({
      where: {
        status: "dead",
        userId: currentUser.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: "Proxies cleaned up successfully" };
  } catch (err) {
    throw handleRequestError(err);
  }
};
