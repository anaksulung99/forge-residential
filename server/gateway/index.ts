import "dotenv/config";
import { Server } from "proxy-chain";
import { prisma } from "../utils/database";
import { resolveUpstream } from "../utils/gateway-resolver";
import { publishEvent } from "../utils/queue";
import { markProxyFailure, markProxySuccess } from "../utils/proxy-health";

// =====================================================================
// Rotating Gateway (Fase 5) — proses standalone (PM2: proxy-gateway)
// Jalankan:  pnpm gateway   (dev)  /  pnpm gateway:prod
//
// Client:  http://<gatewayUsername>:<gatewayPassword>@<host>:<GATEWAY_PORT>
// 1 listener melayani banyak pool; pool & opsi di-encode di username.
// =====================================================================

const port = Number(process.env.GATEWAY_PORT || 10000);
const host = process.env.GATEWAY_HOST_BIND || "0.0.0.0";

interface ConnInfo {
  poolId: string;
  userId: string;
  proxyId: string;
  targetHost: string | null;
  resolved?: boolean; // sudah dapat sinyal sukses/gagal upstream?
}
const conns = new Map<number, ConnInfo>();

const server = new Server({
  port,
  host,
  verbose: false,
  prepareRequestFunction: async ({
    connectionId,
    username,
    password,
    hostname,
    port,
    isHttp,
  }) => {
    const res = await resolveUpstream(username || "", password || "", {
      host: hostname,
      port,
      isHttp,
    });
    if (!res.ok) {
      return {
        requestAuthentication: true,
        failMsg: res.message,
      };
    }
    conns.set(connectionId, {
      poolId: res.poolId,
      userId: res.userId,
      proxyId: res.proxyId,
      targetHost: hostname || null,
      resolved: false,
    });
    // customTag ikut di event tunnelConnect* untuk atribusi kegagalan upstream
    return {
      upstreamProxyUrl: res.url,
      customTag: { proxyId: res.proxyId, userId: res.userId },
    };
  },
});

// ── Auto-detect kesehatan upstream (CONNECT/HTTPS) ────────────────────
server.on(
  "tunnelConnectResponded",
  ({ proxyChainId }: { proxyChainId: number }) => {
    const info = conns.get(proxyChainId);
    if (!info) return;
    info.resolved = true;
    markProxySuccess(info.proxyId);
  },
);
server.on(
  "tunnelConnectFailed",
  ({ proxyChainId }: { proxyChainId: number }) => {
    const info = conns.get(proxyChainId);
    if (!info) return;
    info.resolved = true;
    markProxyFailure(info.proxyId, info.userId, {
      reason: "upstream tunnel connect failed",
    });
  },
);

// Log trafik + update metrik saat koneksi ditutup
server.on("connectionClosed", ({ connectionId, stats }) => {
  const info = conns.get(connectionId);
  conns.delete(connectionId);
  if (!info) return;

  const bytesIn = Math.max(0, Math.round(stats?.srcRxBytes ?? 0));
  const bytesOut = Math.max(0, Math.round(stats?.srcTxBytes ?? 0));

  // Sinyal kesehatan untuk koneksi yang belum ter-resolve via event tunnel
  // (mis. plain HTTP, atau upstream refused/timeout → trgRxBytes null).
  if (!info.resolved) {
    const trgRx = stats?.trgRxBytes;
    if (trgRx == null || trgRx === 0) {
      markProxyFailure(info.proxyId, info.userId, {
        reason: "no upstream data",
      });
    } else {
      markProxySuccess(info.proxyId);
    }
  }

  prisma.gatewayRequestLog
    .create({
      data: {
        poolId: info.poolId,
        proxyId: info.proxyId,
        userId: info.userId,
        targetHost: info.targetHost,
        bytesIn: BigInt(bytesIn),
        bytesOut: BigInt(bytesOut),
      },
    })
    .catch(() => {});

  // Akumulasi pemakaian kuota user (untuk enforcement & display)
  prisma.userQuota
    .upsert({
      where: { userId: info.userId },
      create: {
        userId: info.userId,
        usedBytes: BigInt(bytesIn + bytesOut),
        usedRequests: BigInt(1),
      },
      update: {
        usedBytes: { increment: BigInt(bytesIn + bytesOut) },
        usedRequests: { increment: BigInt(1) },
      },
    })
    .catch(() => {});
});

server.on("requestFailed", ({ error }) => {
  console.error("[gateway] request gagal:", error?.message);
});

async function bootstrap() {
  await server.listen();
  console.log(`✅ Rotating gateway listening di ${host}:${port}`);
  await publishEvent("worker:health", { service: "gateway", status: "up" });
}

bootstrap().catch((err) => {
  console.error("Gateway gagal start:", err);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} diterima — menutup gateway…`);
  await server.close(true).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
