import net from "node:net";
import tls from "node:tls";
import type { ProxyProtocol } from "@prisma/client";
import { prisma } from "./database";
import { cacheGetJSON, cacheSetJSON } from "./queue";
import { markProxyFailure } from "./proxy-health";

const FAILOVER_ATTEMPTS = Number(process.env.GATEWAY_FAILOVER_ATTEMPTS || 5);
const PROBE_TIMEOUT_MS = Number(process.env.GATEWAY_PROBE_TIMEOUT_MS || 1500);
const DEEP_PROBE_TIMEOUT_MS = Number(
  process.env.GATEWAY_DEEP_PROBE_TIMEOUT_MS || 6000,
);
const DEEP_PROBE_CACHE_SEC = Number(
  process.env.GATEWAY_DEEP_PROBE_CACHE_SEC || 120,
);
const ENABLE_DEEP_HTTPS_PROBE =
  process.env.GATEWAY_DEEP_HTTPS_PROBE !== "false";

// =====================================================================
// Gateway resolver (Fase 5)
// Terjemahkan kredensial client → pool + opsi (country/session/type),
// lalu pilih satu upstream proxy sehat (rotasi per-request / sticky).
//
// Format username client:
//   <gatewayUsername>[-country-<cc>][-session-<id>][-type-<proto>]
//   contoh: res_ab12cd34-country-us-session-abc123-type-http
// Password client = pool.gatewayPassword
// =====================================================================

interface ParsedCreds {
  base: string;
  country?: string;
  session?: string;
  type?: ProxyProtocol;
}

export function parseGatewayUsername(username: string): ParsedCreds {
  const parts = username.split("-");
  const out: ParsedCreds = { base: parts[0] ?? "" };
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const k = (parts[i] ?? "").toLowerCase();
    const v = parts[i + 1] ?? "";
    if (k === "country") out.country = v.toUpperCase();
    else if (k === "session") out.session = v;
    else if (k === "type" && ["http", "https", "socks5"].includes(v))
      out.type = v as ProxyProtocol;
  }
  return out;
}

interface CachedPool {
  id: string;
  userId: string;
  gatewayPassword: string;
  isActive: boolean;
  rotationMode: string;
  stickyTtlSec: number | null;
  filterCountry: string | null;
  filterProtocol: ProxyProtocol | null;
}

async function getPoolByGatewayUser(base: string): Promise<CachedPool | null> {
  const key = `gw:pool:${base}`;
  const cached = await cacheGetJSON<CachedPool>(key);
  if (cached) return cached;

  const pool = await prisma.proxyPool.findUnique({
    where: { gatewayUsername: base },
    select: {
      id: true,
      userId: true,
      gatewayPassword: true,
      isActive: true,
      rotationMode: true,
      stickyTtlSec: true,
      filterCountry: true,
      filterProtocol: true,
      deletedAt: true,
    },
  });
  if (!pool || pool.deletedAt) return null;

  const value: CachedPool = {
    id: pool.id,
    userId: pool.userId,
    gatewayPassword: pool.gatewayPassword,
    isActive: pool.isActive,
    rotationMode: pool.rotationMode,
    stickyTtlSec: pool.stickyTtlSec,
    filterCountry: pool.filterCountry,
    filterProtocol: pool.filterProtocol,
  };
  await cacheSetJSON(key, value, 30);
  return value;
}

// ── Quota per user (null = unlimited) ─────────────────────────────────
interface QuotaInfo {
  quotaBytes: number | null;
  quotaRequests: number | null;
  usedBytes: number;
  usedRequests: number;
}

async function getUserQuota(userId: string): Promise<QuotaInfo> {
  const key = `gw:quota:${userId}`;
  const cached = await cacheGetJSON<QuotaInfo>(key);
  if (cached) return cached;

  const q = await prisma.userQuota.findUnique({ where: { userId } });
  const info: QuotaInfo = {
    quotaBytes: q?.quotaBytes != null ? Number(q.quotaBytes) : null,
    quotaRequests: q?.quotaRequests != null ? Number(q.quotaRequests) : null,
    usedBytes: q ? Number(q.usedBytes) : 0,
    usedRequests: q ? Number(q.usedRequests) : 0,
  };
  await cacheSetJSON(key, info, 10); // cache pendek → enforcement ~real-time
  return info;
}

interface Candidate {
  id: string;
  host: string;
  port: number;
  protocol: ProxyProtocol;
  username: string | null;
  password: string | null;
}

async function getCandidates(
  poolId: string,
  country?: string,
  type?: ProxyProtocol,
): Promise<Candidate[]> {
  const key = `gw:cand:${poolId}:${country ?? "*"}:${type ?? "*"}`;
  const cached = await cacheGetJSON<Candidate[]>(key);
  if (cached) return cached;

  const members = await prisma.proxyPoolMember.findMany({
    where: {
      poolId,
      enabled: true,
      proxy: {
        status: "active",
        deletedAt: null,
        ...(country ? { country } : {}),
        ...(type ? { protocol: type } : {}),
      },
    },
    select: {
      proxy: {
        select: {
          id: true,
          host: true,
          port: true,
          protocol: true,
          username: true,
          password: true,
        },
      },
    },
    take: 2000,
  });

  const cands = members.map((m) => m.proxy);
  await cacheSetJSON(key, cands, 30);
  return cands;
}

function buildUpstreamUrl(p: Candidate): string {
  const scheme = p.protocol === "socks5" ? "socks5" : "http";
  const auth =
    p.username != null
      ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password ?? "")}@`
      : "";
  return `${scheme}://${auth}${p.host}:${p.port}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface ProbeTarget {
  host: string;
  port: number;
  isHttp: boolean; // true = plain HTTP (forward), false = HTTPS (CONNECT)
}

/** Probe TCP cepat: apakah host:port menerima koneksi? */
function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    const sock = net.connect({ host, port });
    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });
}

/**
 * Probe CONNECT asli ke upstream HTTP/HTTPS: kirim `CONNECT host:port` &
 * cek balasan 200. Memvalidasi kemampuan tunnel (hindari 590 NON_200 dari
 * proxy yang TCP-nya hidup tapi tak mendukung CONNECT).
 */
function connectProbe(c: Candidate, target: ProbeTarget): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    const sock = net.connect({ host: c.host, port: c.port });
    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.once("connect", () => {
      let req =
        `CONNECT ${target.host}:${target.port} HTTP/1.1\r\n` +
        `Host: ${target.host}:${target.port}\r\n`;
      if (c.username != null) {
        const auth = Buffer.from(
          `${c.username}:${c.password ?? ""}`,
        ).toString("base64");
        req += `Proxy-Authorization: Basic ${auth}\r\n`;
      }
      req += "\r\n";
      sock.write(req);
    });
    let buf = "";
    sock.on("data", (d) => {
      buf += d.toString("latin1");
      const idx = buf.indexOf("\r\n");
      if (idx !== -1) {
        const firstLine = buf.slice(0, idx);
        finish(/\s2\d\d\s/.test(` ${firstLine} `));
      }
    });
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });
}

function parseHttpStatus(head: string): number | null {
  const firstLine = head.slice(0, head.indexOf("\r\n"));
  const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/i.exec(firstLine);
  return match ? Number(match[1]) : null;
}

function deepHttpsProbe(c: Candidate, target: ProbeTarget): Promise<boolean> {
  if (c.protocol === "socks5") return tcpProbe(c.host, c.port);

  return new Promise((resolve) => {
    let done = false;
    let sock: net.Socket | null = null;
    let tlsSock: tls.TLSSocket | null = null;
    let timer: NodeJS.Timeout | null = null;

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      tlsSock?.destroy();
      sock?.destroy();
      resolve(ok);
    };

    timer = setTimeout(() => finish(false), DEEP_PROBE_TIMEOUT_MS);
    sock = net.connect({ host: c.host, port: c.port });
    sock.once("connect", () => {
      let req =
        `CONNECT ${target.host}:${target.port} HTTP/1.1\r\n` +
        `Host: ${target.host}:${target.port}\r\n`;
      if (c.username != null) {
        const auth = Buffer.from(
          `${c.username}:${c.password ?? ""}`,
        ).toString("base64");
        req += `Proxy-Authorization: Basic ${auth}\r\n`;
      }
      req += "\r\n";
      sock?.write(req);
    });

    let connectBuf = "";
    sock.on("data", (d) => {
      connectBuf += d.toString("latin1");
      const headerEnd = connectBuf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const status = parseHttpStatus(connectBuf.slice(0, headerEnd + 2));
      if (status == null || status < 200 || status >= 300 || !sock) {
        finish(false);
        return;
      }

      sock.removeAllListeners("data");
      tlsSock = tls.connect({
        socket: sock,
        servername: target.host,
        rejectUnauthorized: false,
      });

      tlsSock.once("secureConnect", () => {
        tlsSock?.write(
          `GET / HTTP/1.1\r\n` +
            `Host: ${target.host}\r\n` +
            "User-Agent: Mozilla/5.0\r\n" +
            "Accept: */*\r\n" +
            "Connection: close\r\n\r\n",
        );
      });

      let responseBuf = "";
      tlsSock.on("data", (chunk) => {
        responseBuf += chunk.toString("latin1");
        const idx = responseBuf.indexOf("\r\n");
        if (idx === -1) return;
        const statusCode = parseHttpStatus(responseBuf.slice(0, idx + 2));
        finish(statusCode != null && statusCode >= 200 && statusCode < 500);
      });
      tlsSock.once("error", () => finish(false));
      tlsSock.once("timeout", () => finish(false));
      tlsSock.setTimeout(DEEP_PROBE_TIMEOUT_MS);
    });
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.setTimeout(DEEP_PROBE_TIMEOUT_MS);
  });
}

/** Pilih metode probe sesuai protokol upstream & jenis target. */
async function probeUpstream(
  c: Candidate,
  target?: ProbeTarget,
): Promise<boolean> {
  // SOCKS5 / plain-HTTP / tanpa target → cukup cek TCP.
  // HTTPS (CONNECT) via upstream http/https → CONNECT probe.
  if (!target || target.isHttp || c.protocol === "socks5") {
    return tcpProbe(c.host, c.port);
  }

  if (ENABLE_DEEP_HTTPS_PROBE) {
    const cacheKey = `gw:deep-ok:${c.id}:${target.host}:${target.port}`;
    const cached = await cacheGetJSON<boolean>(cacheKey);
    if (cached === true) return true;

    const ok = await deepHttpsProbe(c, target);
    if (ok) await cacheSetJSON(cacheKey, true, DEEP_PROBE_CACHE_SEC);
    return ok;
  }

  return connectProbe(c, target);
}

/**
 * Probe beberapa kandidat paralel; kembalikan yang PERTAMA lolos (cepat).
 * Kandidat yang gagal probe → markProxyFailure (prune lebih cepat).
 */
function probeSelect(
  cands: Candidate[],
  userId: string,
  target?: ProbeTarget,
): Promise<Candidate | null> {
  if (cands.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pending = cands.length;
    let resolved = false;
    for (const c of cands) {
      probeUpstream(c, target).then((ok) => {
        if (ok) {
          if (!resolved) {
            resolved = true;
            resolve(c);
          }
        } else {
          markProxyFailure(c.id, userId).catch(() => {});
        }
        if (--pending === 0 && !resolved) resolve(null);
      });
    }
  });
}

export type ResolveResult =
  | {
      ok: true;
      url: string;
      upstream: {
        host: string;
        port: number;
        protocol: ProxyProtocol;
      };
      poolId: string;
      userId: string;
      proxyId: string;
    }
  | { ok: false; message: string };

/**
 * Resolusi utama: kredensial client → upstream proxy URL.
 */
export async function resolveUpstream(
  username: string,
  password: string,
  target?: ProbeTarget,
): Promise<ResolveResult> {
  const creds = parseGatewayUsername(username || "");
  if (!creds.base) return { ok: false, message: "Missing credentials" };

  const pool = await getPoolByGatewayUser(creds.base);
  if (!pool) return { ok: false, message: "Unknown gateway user" };
  if (pool.gatewayPassword !== password)
    return { ok: false, message: "Invalid gateway password" };
  if (!pool.isActive) return { ok: false, message: "Pool is inactive" };

  // Enforcement quota (bandwidth & request)
  const quota = await getUserQuota(pool.userId);
  if (quota.quotaBytes != null && quota.usedBytes >= quota.quotaBytes)
    return { ok: false, message: "Bandwidth quota exceeded" };
  if (quota.quotaRequests != null && quota.usedRequests >= quota.quotaRequests)
    return { ok: false, message: "Request quota exceeded" };

  const country = creds.country ?? pool.filterCountry ?? undefined;
  const type = creds.type ?? pool.filterProtocol ?? undefined;

  const candidates = await getCandidates(pool.id, country, type);
  if (candidates.length === 0)
    return { ok: false, message: "No healthy upstream in pool" };

  const userId = pool.userId;
  const ttl = pool.stickyTtlSec ?? 600;
  const stickyKey = creds.session
    ? `gw:sticky:${pool.id}:${creds.session}`
    : pool.rotationMode === "sticky"
      ? `gw:sticky:${pool.id}:${username}`
      : null;

  const ok = (c: Candidate): ResolveResult => ({
    ok: true,
    url: buildUpstreamUrl(c),
    upstream: {
      host: c.host,
      port: c.port,
      protocol: c.protocol,
    },
    poolId: pool.id,
    userId,
    proxyId: c.id,
  });

  // Sticky fast-path: pakai ulang IP sesi bila masih bisa connect (hemat probe)
  if (stickyKey) {
    const prevId = await cacheGetJSON<string>(stickyKey);
    const prev = prevId ? candidates.find((c) => c.id === prevId) : null;
    if (prev) {
      if (await probeUpstream(prev, target)) {
        await cacheSetJSON(stickyKey, prev.id, ttl); // refresh TTL
        return ok(prev);
      }
      // sticky proxy mati → tandai & pilih IP baru utk sesi ini
      markProxyFailure(prev.id, userId).catch(() => {});
    }
  }

  // Failover: probe N kandidat acak paralel, pakai yang pertama lolos
  const attempts = Math.min(FAILOVER_ATTEMPTS, candidates.length);
  const chosen = await probeSelect(
    shuffle(candidates).slice(0, attempts),
    userId,
    target,
  );
  if (!chosen)
    return { ok: false, message: "No reachable upstream (semua probe gagal)" };

  if (stickyKey) await cacheSetJSON(stickyKey, chosen.id, ttl);
  return ok(chosen);
}
