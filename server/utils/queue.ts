import fs from "node:fs";
import path from "node:path";
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import type { RedisOptions } from "ioredis";

// =====================================================================
// Koneksi Redis + Queue BullMQ (Fase 2)
// Dipakai bersama oleh API (Nitro) & worker (standalone), jadi sengaja
// baca dari process.env — BUKAN useRuntimeConfig (tidak ada di worker).
// =====================================================================

export const PROXY_CHECK_QUEUE = "proxy-check";
export const PROXY_SCRAPE_QUEUE = "proxy-scrape";

export type CheckMethod = "fast" | "playwright";

export interface ProxyCheckJobData {
  proxyId: string;
  method: CheckMethod;
}

export interface ProxyScrapeJobData {
  scrapeJobId: string;
}

function loadTls(): RedisOptions["tls"] | undefined {
  try {
    const dir = path.resolve(process.cwd(), "certs/redis");
    const ca = path.join(dir, "ca.crt");
    const crt = path.join(dir, "redis.crt");
    const key = path.join(dir, "redis.key");
    if (fs.existsSync(ca) && fs.existsSync(crt) && fs.existsSync(key)) {
      return {
        ca: fs.readFileSync(ca),
        cert: fs.readFileSync(crt),
        key: fs.readFileSync(key),
        rejectUnauthorized: true,
      };
    }
  } catch {
    /* tanpa TLS */
  }
  return undefined;
}

function buildRedisOptions(): RedisOptions {
  const tls = loadTls();
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USER || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    ...(tls ? { tls } : {}),
    // wajib null untuk BullMQ
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // backoff lembut, jangan spam-loop saat Redis sempat down
    retryStrategy: (times) => Math.min(times * 200, 5000),
  };
}

/**
 * Buat koneksi IORedis baru (BullMQ butuh koneksi terpisah untuk Queue/Worker).
 * CATATAN: BullMQ HANYA mendukung Redis. `BULLMQ_URL` di .env ini berisi AMQP
 * (RabbitMQ :5672) dan sengaja DIABAIKAN. Koneksi dibangun dari REDIS_* + TLS,
 * sama seperti server/plugins/ws-subscriber.ts. `REDIS_URL` hanya dipakai bila
 * benar-benar skema redis:// / rediss://.
 */
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (url && /^rediss?:\/\//i.test(url)) {
    return new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
  }
  return new IORedis(buildRedisOptions());
}

// ── Singleton koneksi & queue (dishare dalam satu proses) ─────────────
const g = globalThis as unknown as {
  __proxyQueueConn?: IORedis;
  __proxyCheckQueue?: Queue;
  __proxyScrapeQueue?: Queue;
  __proxyPublisher?: IORedis;
};

export function getQueueConnection(): IORedis {
  if (!g.__proxyQueueConn) g.__proxyQueueConn = createRedisConnection();
  return g.__proxyQueueConn;
}

export function getProxyCheckQueue(): Queue {
  if (!g.__proxyCheckQueue) {
    g.__proxyCheckQueue = new Queue(PROXY_CHECK_QUEUE, {
      connection: getQueueConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5_000 },
        // PENTING: hapus segera setelah selesai. Kalau di-retain, jobId yang
        // sama tidak bisa di-enqueue ulang (BullMQ tolak duplicate jobId) →
        // proxy nyangkut status 'checking'. Lihat remove-before-add di bawah.
        removeOnComplete: true,
        removeOnFail: 1_000,
      },
    });
  }
  return g.__proxyCheckQueue;
}

/**
 * Antrekan satu pengecekan proxy.
 * jobId `check-<id>` menjaga 1 job aktif per proxy, TAPI job lama (completed/
 * failed yang tertahan) harus dihapus dulu agar re-check tidak diabaikan.
 */
export async function enqueueProxyCheck(
  proxyId: string,
  method: CheckMethod = "fast",
) {
  const q = getProxyCheckQueue();
  await q.remove(`check-${proxyId}`).catch(() => {});
  return q.add(
    "check",
    { proxyId, method },
    { jobId: `check-${proxyId}` },
  );
}

/** Antrekan banyak sekaligus (bulk) — remove-before-add agar re-check selalu jalan. */
export async function enqueueProxyChecks(
  proxyIds: string[],
  method: CheckMethod = "fast",
) {
  if (proxyIds.length === 0) return;
  const q = getProxyCheckQueue();
  // Hapus job lama dgn jobId sama (termasuk completed/failed tertahan).
  await Promise.allSettled(proxyIds.map((id) => q.remove(`check-${id}`)));
  await q.addBulk(
    proxyIds.map((proxyId) => ({
      name: "check",
      data: { proxyId, method },
      opts: { jobId: `check-${proxyId}` },
    })),
  );
}

export function getProxyScrapeQueue(): Queue {
  if (!g.__proxyScrapeQueue) {
    g.__proxyScrapeQueue = new Queue(PROXY_SCRAPE_QUEUE, {
      connection: getQueueConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
  }
  return g.__proxyScrapeQueue;
}

/** Antrekan satu job scraping (1 situs sumber). */
export async function enqueueScrape(scrapeJobId: string) {
  return getProxyScrapeQueue().add(
    "scrape",
    { scrapeJobId },
    { jobId: `scrape-${scrapeJobId}` },
  );
}

// ── Publisher untuk realtime (Redis pub/sub → WS via ws-subscriber) ───
export function getPublisher(): IORedis {
  if (!g.__proxyPublisher) g.__proxyPublisher = createRedisConnection();
  return g.__proxyPublisher;
}

export async function publishEvent(channel: string, data: unknown) {
  try {
    await getPublisher().publish(channel, JSON.stringify(data));
  } catch {
    /* realtime best-effort */
  }
}

// ── Cache sederhana (dipakai geoip) ───────────────────────────────────
export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  try {
    const v = await getPublisher().get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSetJSON(
  key: string,
  value: unknown,
  ttlSec: number,
) {
  try {
    await getPublisher().set(key, JSON.stringify(value), "EX", ttlSec);
  } catch {
    /* best-effort */
  }
}

export async function cacheDel(key: string) {
  try {
    await getPublisher().del(key);
  } catch {
    /* best-effort */
  }
}
