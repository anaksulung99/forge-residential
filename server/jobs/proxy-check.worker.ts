import "dotenv/config";
import { Worker } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import { prisma } from "../utils/database";
import {
  PROXY_CHECK_QUEUE,
  PROXY_SCRAPE_QUEUE,
  createRedisConnection,
  getProxyCheckQueue,
  enqueueProxyChecks,
  publishEvent,
} from "../utils/queue";
import type { ProxyCheckJobData, ProxyScrapeJobData } from "../utils/queue";
import { processProxyCheck } from "../utils/proxy-check-service";
import { runScrapeJob } from "../utils/scrape-service";

// =====================================================================
// Worker BullMQ proxy-check (Fase 2)
// Jalankan via:  pnpm worker   (atau PM2: proxy-worker)
// =====================================================================

const concurrency = Number(process.env.PROXY_CHECK_CONCURRENCY || 10);
const staleMs = Number(process.env.PROXY_RECHECK_STALE_MS || 30 * 60 * 1000);
const scanIntervalMs = Number(
  process.env.PROXY_SCAN_INTERVAL_MS || 10 * 60 * 1000,
);
const scanDisabled = process.env.PROXY_SCAN_DISABLED === "true";

const connection = createRedisConnection();

async function runScanStale() {
  const threshold = new Date(Date.now() - staleMs);
  const stale = await prisma.proxy.findMany({
    where: {
      deletedAt: null,
      // 'checking' diikutkan → auto-heal proxy yang nyangkut checking
      status: { in: ["active", "dead", "pending", "checking"] },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: threshold } }],
    },
    select: { id: true },
    take: 1000,
  });
  if (stale.length === 0) return 0;
  await enqueueProxyChecks(
    stale.map((p) => p.id),
    "fast",
  );
  return stale.length;
}

const worker = new Worker<ProxyCheckJobData>(
  PROXY_CHECK_QUEUE,
  async (job: Job<ProxyCheckJobData>) => {
    if (job.name === "scan-stale") {
      const n = await runScanStale();
      return { scanned: n };
    }

    const { proxyId, method } = job.data;
    const result = await processProxyCheck(proxyId, method);
    if (!result) return { skipped: true };

    await publishEvent("proxy:update", {
      userId: result.userId,
      proxyId: result.proxyId,
      status: result.status,
      latencyMs: result.latencyMs,
    });
    return result;
  },
  {
    connection: connection as unknown as ConnectionOptions,
    concurrency,
  },
);

// Worker scrape (konkurensi rendah — scraping lebih berat)
const scrapeWorker = new Worker<ProxyScrapeJobData>(
  PROXY_SCRAPE_QUEUE,
  async (job: Job<ProxyScrapeJobData>) => {
    const result = await runScrapeJob(job.data.scrapeJobId);
    return result ?? { skipped: true };
  },
  {
    connection: createRedisConnection() as unknown as ConnectionOptions,
    concurrency: Number(process.env.PROXY_SCRAPE_CONCURRENCY || 2),
  },
);

scrapeWorker.on("failed", (job, err) => {
  console.error(`[proxy-scrape] job ${job?.id} gagal:`, err?.message);
});
scrapeWorker.on("error", (err) => {
  console.error("[proxy-scrape] worker error:", err?.message);
});

worker.on("completed", (job) => {
  publishEvent("queue:update", {
    queue: PROXY_CHECK_QUEUE,
    jobId: job.id,
    status: "completed",
  });
});

worker.on("failed", (job, err) => {
  console.error(`[proxy-check] job ${job?.id} gagal:`, err?.message);
  publishEvent("queue:update", {
    queue: PROXY_CHECK_QUEUE,
    jobId: job?.id,
    status: "failed",
  });
});

worker.on("error", (err) => {
  console.error("[proxy-check] worker error:", err?.message);
});

async function bootstrap() {
  // Jadwalkan scan berkala untuk re-check proxy yang sudah basi
  if (!scanDisabled) {
    await getProxyCheckQueue().add(
      "scan-stale",
      {} as ProxyCheckJobData,
      {
        repeat: { every: scanIntervalMs },
        jobId: "scan-stale",
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    console.log(
      `🔁 Scheduled re-check tiap ${Math.round(scanIntervalMs / 60000)} menit (stale > ${Math.round(staleMs / 60000)} menit)`,
    );
  }
  console.log(
    `✅ proxy-check worker siap (concurrency=${concurrency}, queue=${PROXY_CHECK_QUEUE})`,
  );
}

bootstrap().catch((err) => {
  console.error("Worker bootstrap gagal:", err);
  process.exit(1);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} diterima — menutup worker…`);
  await Promise.all([worker.close(), scrapeWorker.close()]);
  await connection.quit().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
