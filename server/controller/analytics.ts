import type { H3Event } from "h3";

// =====================================================================
// Analytics controller (Fase 6)
// Agregasi proxy + trafik gateway (GatewayRequestLog) untuk dashboard.
// Semua nilai BigInt dikonversi ke Number sebelum return (JSON-safe).
// =====================================================================

const MB = 1024 * 1024;

function toNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

/** GET /api/analytics/overview */
export const getOverviewHandler = async (event: H3Event) => {
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
    const userId = currentUser.id;
    const baseWhere = { userId, deletedAt: null };

    const since = new Date(Date.now() - 13 * 86_400_000);
    since.setHours(0, 0, 0, 0);

    const [
      statusGroups,
      categoryGroups,
      totalProxies,
      totalPools,
      activePools,
      countryGroups,
      trafficAgg,
      rawSeries,
      poolAgg,
    ] = await Promise.all([
      prisma.proxy.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.proxy.groupBy({
        by: ["category"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.proxy.count({ where: baseWhere }),
      prisma.proxyPool.count({ where: { userId, deletedAt: null } }),
      prisma.proxyPool.count({
        where: { userId, deletedAt: null, isActive: true },
      }),
      prisma.proxy.groupBy({
        by: ["country"],
        where: { ...baseWhere, country: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { country: "desc" } },
        take: 8,
      }),
      prisma.gatewayRequestLog.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: { bytesIn: true, bytesOut: true },
      }),
      prisma.$queryRaw<{ day: Date; requests: number; bytes: bigint }[]>`
        SELECT date_trunc('day', created_at) AS day,
               count(*)::int AS requests,
               COALESCE(sum(bytes_in + bytes_out), 0)::bigint AS bytes
        FROM gateway_request_logs
        WHERE user_id = ${userId}::uuid AND created_at >= ${since}
        GROUP BY 1 ORDER BY 1`,
      prisma.gatewayRequestLog.groupBy({
        by: ["poolId"],
        where: { userId },
        _count: { _all: true },
        _sum: { bytesIn: true, bytesOut: true },
        orderBy: { _count: { poolId: "desc" } },
        take: 5,
      }),
    ]);

    const statusMap = new Map(
      statusGroups.map((g) => [g.status, g._count._all]),
    );
    const categoryMap = new Map(
      categoryGroups.map((g) => [g.category, g._count._all]),
    );

    // Series 14 hari (isi gap dengan 0)
    const seriesMap = new Map(
      rawSeries.map((r) => [
        new Date(r.day).toISOString().slice(0, 10),
        { requests: toNum(r.requests), bytes: toNum(r.bytes) },
      ]),
    );
    const series: { date: string; requests: number; mb: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const hit = seriesMap.get(key);
      series.push({
        date: key.slice(5), // MM-DD
        requests: hit?.requests ?? 0,
        mb: hit ? Math.round((hit.bytes / MB) * 100) / 100 : 0,
      });
    }

    // Top pools (gabung nama)
    const poolIds = poolAgg.map((p) => p.poolId);
    const poolNames = await prisma.proxyPool.findMany({
      where: { id: { in: poolIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(poolNames.map((p) => [p.id, p.name]));
    const topPools = poolAgg.map((a) => ({
      name: nameMap.get(a.poolId) ?? "—",
      requests: a._count._all,
      mb:
        Math.round(
          ((toNum(a._sum.bytesIn) + toNum(a._sum.bytesOut)) / MB) * 100,
        ) / 100,
    }));

    const bytesIn = toNum(trafficAgg._sum.bytesIn);
    const bytesOut = toNum(trafficAgg._sum.bytesOut);

    return {
      success: true,
      message: "OK",
      data: {
        summary: {
          totalProxies,
          active: statusMap.get("active") ?? 0,
          dead: statusMap.get("dead") ?? 0,
          pending: statusMap.get("pending") ?? 0,
          checking: statusMap.get("checking") ?? 0,
          banned: statusMap.get("banned") ?? 0,
          mobile: categoryMap.get("MOBILE_ROTATING") ?? 0,
          residential: categoryMap.get("RESIDENTIAL_ROTATING") ?? 0,
          totalPools,
          activePools,
        },
        traffic: {
          totalRequests: trafficAgg._count._all,
          bytesIn,
          bytesOut,
          gb: Math.round(((bytesIn + bytesOut) / (1024 * MB)) * 1000) / 1000,
        },
        series,
        statusDistribution: [
          { label: "Active", value: statusMap.get("active") ?? 0 },
          { label: "Dead", value: statusMap.get("dead") ?? 0 },
          { label: "Pending", value: statusMap.get("pending") ?? 0 },
          { label: "Checking", value: statusMap.get("checking") ?? 0 },
          { label: "Banned", value: statusMap.get("banned") ?? 0 },
        ],
        categoryDistribution: [
          {
            label: "Residential",
            value: categoryMap.get("RESIDENTIAL_ROTATING") ?? 0,
          },
          { label: "Mobile", value: categoryMap.get("MOBILE_ROTATING") ?? 0 },
        ],
        topCountries: countryGroups.map((g) => ({
          country: g.country as string,
          count: g._count._all,
        })),
        topPools,
      },
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};
