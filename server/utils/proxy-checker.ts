import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { ProxyProtocol } from "@prisma/client";

// =====================================================================
// Proxy fast-checker — request HTTPS lewat proxy ke judge.
// Pakai HTTPS (bukan HTTP) supaya HANYA proxy yang benar-benar bisa
// HTTPS CONNECT yang lolos → status 'active' = CONNECT-capable (kualitas
// pool naik, gateway jarang kena 590). Judge: Cloudflare trace (ringan,
// ada ip= & loc=, tanpa rate-limit). Cert ditolerir (rejectUnauthorized
// false) agar konsisten dgn client yang pakai ignoreHTTPSErrors.
// =====================================================================

const JUDGE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
const DEFAULT_TIMEOUT_MS = 12_000;

function parseTrace(text: string): { ip: string | null; loc: string | null } {
  const ip = text.match(/^ip=(.+)$/m)?.[1]?.trim() ?? null;
  const loc = text.match(/^loc=(.+)$/m)?.[1]?.trim() ?? null;
  return { ip, loc };
}

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
      : new HttpsProxyAgent(proxyUrl);

  const startedAt = Date.now();

  return new Promise<FastCheckResult>((resolve) => {
    let settled = false;
    const finish = (r: FastCheckResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const req = https.get(
      JUDGE_URL,
      { agent, timeout: timeoutMs, rejectUnauthorized: false },
      (res) => {
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
          const { ip, loc } = parseTrace(
            Buffer.concat(chunks).toString("utf8"),
          );
          if (ip) {
            return finish({
              ok: true,
              latencyMs,
              exitIp: ip,
              exitCountry: loc,
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
        });
      },
    );

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

    req.on("error", (err: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        latencyMs: null,
        exitIp: null,
        exitCountry: null,
        error: err?.message || err?.code || "Request error",
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
      args: [
        "--no-sandbox", // wajib saat jalan sebagai root (server)
        "--disable-setuid-sandbox",
        "--ignore-certificate-errors", // proxy publik sering MITM/cert invalid
        "--disable-blink-features=AutomationControlled", // stealth ringan
      ],
      proxy: {
        server,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {}),
      },
    });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 768 },
      locale: "en-US",
    });
    // Percepat: blokir resource berat (gambar/font/css/media)
    await context.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "media" || t === "font" || t === "stylesheet") {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();
    const res = await page.goto("https://www.cloudflare.com/cdn-cgi/trace", {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });
    const latencyMs = Date.now() - startedAt;

    if (!res) {
      return {
        ok: false,
        latencyMs,
        exitIp: null,
        exitCountry: null,
        error: "No response",
      };
    }
    if (res.status() >= 400) {
      return {
        ok: false,
        latencyMs,
        exitIp: null,
        exitCountry: null,
        error: `HTTP ${res.status()}`,
      };
    }

    const { ip, loc } = parseTrace(await res.text().catch(() => ""));
    if (!ip) {
      // Tidak ada IP → kemungkinan halaman challenge/blokir
      return {
        ok: false,
        latencyMs,
        exitIp: null,
        exitCountry: null,
        error: "Blocked / no exit IP",
      };
    }
    return { ok: true, latencyMs, exitIp: ip, exitCountry: loc, error: null };
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
