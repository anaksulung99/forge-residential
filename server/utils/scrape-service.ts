import { prisma } from "./database";
import { scrapeSource } from "./proxy-scraper";
import type { ScrapeSource, ScrapeFilters } from "./proxy-scraper";
import { proxyKey } from "./proxy-parser";
import { ensureDefaultPools } from "./proxy";
import { enqueueProxyChecks, publishEvent } from "./queue";

// =====================================================================
// Eksekusi 1 ScrapeJob (Fase 4) — dipakai worker BullMQ.
// Scrape → dedup (DB) → simpan pending → auto-antre check (→ classify).
// =====================================================================

export interface ScrapeRunResult {
  found: number;
  imported: number;
}

export async function runScrapeJob(
  scrapeJobId: string,
): Promise<ScrapeRunResult | null> {
  const job = await prisma.scrapeJob.findUnique({ where: { id: scrapeJobId } });
  if (!job) return null;

  await prisma.scrapeJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const filters = (job.filters as ScrapeFilters | null) ?? {};
    const scraped = await scrapeSource(job.source as ScrapeSource, filters);
    const found = scraped.length;
    let imported = 0;

    if (found > 0) {
      const hosts = [...new Set(scraped.map((s) => s.host.toLowerCase()))];
      const existing = await prisma.proxy.findMany({
        where: { userId: job.userId, host: { in: hosts } },
        select: { host: true, port: true, protocol: true },
      });
      const existKeys = new Set(
        existing.map((e) =>
          proxyKey({ host: e.host, port: e.port, protocol: e.protocol }),
        ),
      );
      const toInsert = scraped.filter((s) => !existKeys.has(proxyKey(s)));

      if (toInsert.length > 0) {
        const source = await prisma.proxySource.create({
          data: {
            type: "scraper",
            label: job.source,
            url: null,
            userId: job.userId,
          },
        });

        await prisma.proxy.createMany({
          data: toInsert.map((s) => ({
            host: s.host,
            port: s.port,
            protocol: s.protocol,
            country: s.country,
            anonymity: s.anonymity,
            userId: job.userId,
            sourceId: source.id,
          })),
          skipDuplicates: true,
        });

        const fresh = await prisma.proxy.findMany({
          where: { sourceId: source.id },
          select: { id: true },
        });
        imported = fresh.length;

        // Auto-antre check (→ klasifikasi) — best-effort
        try {
          await ensureDefaultPools(job.userId);
          const ids = fresh.map((f) => f.id);
          await prisma.proxy.updateMany({
            where: { id: { in: ids } },
            data: { status: "checking" },
          });
          await enqueueProxyChecks(ids, "fast");
        } catch {
          await prisma.proxy.updateMany({
            where: { sourceId: source.id, status: "checking" },
            data: { status: "pending" },
          });
        }
      }
    }

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "done",
        found,
        imported,
        finishedAt: new Date(),
      },
    });

    await publishEvent("queue:update", {
      queue: "proxy-scrape",
      jobId: job.id,
      status: "done",
    });

    return { found, imported };
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "scrape error",
        finishedAt: new Date(),
      },
    });
    return null;
  }
}
