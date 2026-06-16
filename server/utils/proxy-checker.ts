import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { HttpProxyAgent } from "http-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { ProxyProtocol } from "@prisma/client";

// =====================================================================
// Proxy fast-checker (Fase 1 re-check + fondasi worker Fase 2)
// Request ringan ke judge endpoint lewat proxy untuk ukur liveness,
// latency, dan exit IP/country. Tanpa Playwright (itu deep-check Fase 2).
// =====================================================================

const JUDGE_URL = "http://ip-api.com/json/?fields=status,query,countryCode";
const DEFAULT_TIMEOUT_MS = 12_000;

export interface FastCheckResult {
  ok: boolean;
  latencyMs: number | null;
  exitIp: string | null;
  exitCountry: string | null;
  error: string | null;
}

export interface CheckableProxy {
  host: string;
  port: number;
  protocol: ProxyProtocol;
  username: string | null;
  password: string | null;
}

function buildProxyUrl(p: CheckableProxy): string {
  const scheme = p.protocol === "socks5" ? "socks5" : "http";
  const auth =
    p.username != null
      ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password ?? "")}@`
      : "";
  return `${scheme}://${auth}${p.host}:${p.port}`;
}

export async function fastCheckProxy(
  proxy: CheckableProxy,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FastCheckResult> {
  const proxyUrl = buildProxyUrl(proxy);
  const agent =
    proxy.protocol === "socks5"
      ? new SocksProxyAgent(proxyUrl)
      : new HttpProxyAgent(proxyUrl);

  const startedAt = Date.now();

  return new Promise<FastCheckResult>((resolve) => {
    let settled = false;
    const finish = (r: FastCheckResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const req = http.get(JUDGE_URL, { agent, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => {
        const latencyMs = Date.now() - startedAt;
        if (!res.statusCode || res.statusCode >= 400) {
          return finish({
            ok: false,
            latencyMs,
            exitIp: null,
            exitCountry: null,
            error: `HTTP ${res.statusCode ?? "?"}`,
          });
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (body?.status === "success" && body?.query) {
            return finish({
              ok: true,
              latencyMs,
              exitIp: body.query,
              exitCountry: body.countryCode ?? null,
              error: null,
            });
          }
          return finish({
            ok: false,
            latencyMs,
            exitIp: null,
            exitCountry: null,
            error: "Judge response tidak valid",
          });
        } catch {
          return finish({
            ok: false,
            latencyMs,
            exitIp: null,
            exitCountry: null,
            error: "Gagal parse judge response",
          });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      finish({
        ok: false,
        latencyMs: null,
        exitIp: null,
        exitCountry: null,
        error: "Timeout",
      });
    });

    req.on("error", (err) => {
      finish({
        ok: false,
        latencyMs: null,
        exitIp: null,
        exitCountry: null,
        error: err instanceof Error ? err.message : "Request error",
      });
    });
  });
}

// =====================================================================
// Deep check via Playwright — buka halaman nyata lewat proxy (TLS/JS
// handshake penuh & deteksi blokir). Lebih berat → dipakai selektif.
// =====================================================================
/**
 * Pakai folder browser lokal `root-project/browsers` bila ada & env belum di-set.
 * Playwright membaca PLAYWRIGHT_BROWSERS_PATH sebelum chromium.launch().
 */
export function ensurePlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  const local = path.resolve(process.cwd(), "browsers");
  if (fs.existsSync(local)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = local;
  }
}

export async function deepCheckProxy(
  proxy: CheckableProxy,
  timeoutMs = 25_000,
): Promise<FastCheckResult> {
  ensurePlaywrightBrowsersPath();
  const { chromium } = await import("playwright");
  const server =
    proxy.protocol === "socks5"
      ? `socks5://${proxy.host}:${proxy.port}`
      : `http://${proxy.host}:${proxy.port}`;

  const startedAt = Date.now();
  let browser: import("playwright").Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      proxy: {
        server,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {}),
      },
    });
    const page = await browser.newPage();
    const res = await page.goto("https://ipinfo.io/json", {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });
    const latencyMs = Date.now() - startedAt;

    if (!res || !res.ok()) {
      return {
        ok: false,
        latencyMs,
        exitIp: null,
        exitCountry: null,
        error: `HTTP ${res?.status() ?? "?"}`,
      };
    }

    const body = await res.json().catch(() => null);
    return {
      ok: true,
      latencyMs,
      exitIp: body?.ip ?? null,
      exitCountry: body?.country ?? null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: null,
      exitIp: null,
      exitCountry: null,
      error: err instanceof Error ? err.message : "Playwright error",
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
