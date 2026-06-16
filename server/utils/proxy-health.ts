import { prisma } from "./database";
import { getPublisher, publishEvent, cacheDel } from "./queue";

// =====================================================================
// Proxy health marking (Fase pasca-gateway)
// Dipakai gateway (auto-detect transport) & report API (app-level).
// Pakai rolling counter Redis agar tidak false-positive dari blip transient.
// =====================================================================

const FAIL_THRESHOLD = Number(process.env.GATEWAY_FAIL_THRESHOLD || 3);
const FAIL_WINDOW = Number(process.env.GATEWAY_FAIL_WINDOW_SEC || 120);

/** Tandai proxy mati + bersihkan counter + publish realtime. */
async function killProxy(proxyId: string, userId?: string, reason?: string) {
  const res = await prisma.proxy.updateMany({
    where: { id: proxyId, deletedAt: null },
    data: {
      status: "dead",
      failCount: { increment: 1 },
      lastCheckedAt: new Date(),
    },
  });
  if (res.count === 0) return false;

  await getPublisher()
    .del(`gw:fail:${proxyId}`)
    .catch(() => {});
  // Evict dari cache kandidat gateway (TTL pendek; ini mempercepat)
  await publishEvent("proxy:update", {
    userId,
    proxyId,
    status: "dead",
    reason,
  });
  return true;
}

/**
 * Catat satu kegagalan. immediate=true → langsung mati (dipakai report API
 * dengan dead:true). Selain itu pakai threshold rolling-window.
 */
export async function markProxyFailure(
  proxyId: string,
  userId?: string,
  opts: { immediate?: boolean; reason?: string } = {},
): Promise<void> {
  try {
    if (opts.immediate) {
      await killProxy(proxyId, userId, opts.reason);
      return;
    }
    const r = getPublisher();
    const key = `gw:fail:${proxyId}`;
    const n = await r.incr(key);
    await r.expire(key, FAIL_WINDOW);
    if (n >= FAIL_THRESHOLD) {
      await killProxy(proxyId, userId, opts.reason);
    }
  } catch {
    /* best-effort */
  }
}

/** Catat satu keberhasilan → reset counter kegagalan. */
export async function markProxySuccess(proxyId: string): Promise<void> {
  await cacheDel(`gw:fail:${proxyId}`);
}
