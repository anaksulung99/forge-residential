import { prisma } from "./database";
import { fastCheckProxy, deepCheckProxy } from "./proxy-checker";
import { classifyProxy } from "./proxy-classifier";
import type { CheckMethod } from "./queue";

// =====================================================================
// Core pemrosesan check (Fase 2) — dipakai oleh worker BullMQ & API
// re-check manual. Tidak bergantung pada H3/Nitro auto-import agar bisa
// jalan di proses worker standalone.
// =====================================================================

export interface ProcessResult {
  proxyId: string;
  userId: string;
  ok: boolean;
  status: "active" | "dead";
  latencyMs: number | null;
  exitIp: string | null;
  exitCountry: string | null;
  error: string | null;
  category?: string;
  isMobile?: boolean;
}

/**
 * Jalankan pengecekan satu proxy, update health-nya, catat histori ke
 * ProxyCheck, dan hitung ulang successRate/uptimeScore.
 * Mengembalikan null bila proxy tidak ada / sudah terhapus.
 */
export async function processProxyCheck(
  proxyId: string,
  method: CheckMethod = "fast",
): Promise<ProcessResult | null> {
  const proxy = await prisma.proxy.findFirst({
    where: { id: proxyId, deletedAt: null },
  });
  if (!proxy) return null;

  const check =
    method === "playwright"
      ? await deepCheckProxy({
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          username: proxy.username,
          password: proxy.password,
        })
      : await fastCheckProxy({
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          username: proxy.username,
          password: proxy.password,
        });

  const now = new Date();
  const status: "active" | "dead" = check.ok ? "active" : "dead";

  // Catat histori
  await prisma.proxyCheck.create({
    data: {
      proxyId: proxy.id,
      ok: check.ok,
      method,
      latencyMs: check.latencyMs,
      exitIp: check.exitIp,
      exitCountry: check.exitCountry,
      error: check.error,
    },
  });

  // Hitung ulang skor dari 20 cek terakhir
  const recent = await prisma.proxyCheck.findMany({
    where: { proxyId: proxy.id },
    orderBy: { checkedAt: "desc" },
    take: 20,
    select: { ok: true },
  });
  const okCount = recent.filter((c) => c.ok).length;
  const successRate = recent.length
    ? Math.round((okCount / recent.length) * 100)
    : 0;

  await prisma.proxy.update({
    where: { id: proxy.id },
    data: {
      status,
      latencyMs: check.latencyMs,
      lastCheckedAt: now,
      ...(check.ok && { lastOkAt: now }),
      failCount: check.ok ? 0 : proxy.failCount + 1,
      successRate,
      uptimeScore: successRate,
    },
  });

  // Klasifikasi mobile/residential + routing pool (Fase 3) — best-effort
  let category: string | undefined;
  let isMobile: boolean | undefined;
  if (check.ok && check.exitIp) {
    try {
      const cls = await classifyProxy(
        { id: proxy.id, userId: proxy.userId },
        check.exitIp,
      );
      if (cls) {
        category = cls.category;
        isMobile = cls.isMobile;
      }
    } catch (err) {
      console.error("[classify] gagal:", err instanceof Error ? err.message : err);
    }
  }

  return {
    proxyId: proxy.id,
    userId: proxy.userId,
    ok: check.ok,
    status,
    latencyMs: check.latencyMs,
    exitIp: check.exitIp,
    exitCountry: check.exitCountry,
    error: check.error,
    category,
    isMobile,
  };
}
