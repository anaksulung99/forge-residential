import * as cheerio from "cheerio";
import type { ParsedProtocol } from "./proxy-parser";
import { ensurePlaywrightBrowsersPath } from "./proxy-checker";

// =====================================================================
// Scraper proxy publik (Fase 4)
// 3 situs "sister" (free-proxy-list / sslproxies / us-proxy) struktur tabel
// identik → CheerioCrawler sederhana. spys.one (port di-obfuscate JS) →
// Playwright. Hasil masuk pipeline yang sama (dedup → check → classify).
// =====================================================================

export type ScrapeSource =
  | "free-proxy-list"
  | "sslproxies"
  | "us-proxy"
  | "spys-one"
  | "proxyscrape"
  | "proxy-daily"
  | "sunny-proxy";

export const SCRAPE_SOURCES: ScrapeSource[] = [
  "free-proxy-list",
  "sslproxies",
  "us-proxy",
  "spys-one",
  "proxyscrape",
  "proxy-daily",
  "sunny-proxy",
];

export type ScrapedAnonymity =
  | "transparent"
  | "anonymous"
  | "elite"
  | "unknown";

export interface ScrapedProxy {
  host: string;
  port: number;
  protocol: ParsedProtocol;
  country: string | null;
  anonymity: ScrapedAnonymity;
}

export interface ScrapeFilters {
  country?: string; // ISO-2
  protocol?: ParsedProtocol;
  anonymity?: ScrapedAnonymity;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SOURCE_URL: Record<ScrapeSource, string> = {
  "free-proxy-list": "https://free-proxy-list.net/",
  sslproxies: "https://www.sslproxies.org/",
  "us-proxy": "https://www.us-proxy.org/",
  "spys-one": "https://spys.one/en/free-proxy-list/",
  proxyscrape: "https://proxyscrape.com/free-proxy-list",
  "proxy-daily": "https://proxy-daily.com/",
  "sunny-proxy": "https://sunny9577.github.io/proxy-scraper/",
};

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function cellToText(value: unknown): string {
  if (Array.isArray(value)) return value.map(cellToText).join(" ");
  if (value == null) return "";
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(value: unknown): string | null {
  const raw = cellToText(value);
  if (!raw) return null;

  const iso = raw.match(/\b[A-Z]{2}\b/)?.[0];
  if (iso) return iso;
  return null;
}

function normalizeProtocol(value: unknown): ParsedProtocol {
  const raw = cellToText(value).toLowerCase();
  const parts = raw.split(/[^a-z0-9]+/).filter(Boolean);

  if (parts.some((p) => p.startsWith("socks"))) return "socks5";
  if (parts.includes("https") || raw.includes("ssl")) return "https";
  return "http";
}

function mapAnonymity(s: string): ScrapedAnonymity {
  const v = s.toLowerCase();
  if (v.includes("elite")) return "elite";
  if (v.includes("anonymous")) return "anonymous";
  if (v.includes("transparent")) return "transparent";
  return "unknown";
}

// ── 3 situs tabel statis (Cheerio) ────────────────────────────────────
async function scrapeTableSite(url: string): Promise<ScrapedProxy[]> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const out: ScrapedProxy[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 7) return;
    const host = $(tds[0]).text().trim();
    const port = parseInt($(tds[1]).text().trim(), 10);
    if (!IPV4_RE.test(host) || !port || port > 65535) return;
    const country = $(tds[2]).text().trim().toUpperCase() || null;
    const anonymity = mapAnonymity($(tds[4]).text());
    const https = $(tds[6]).text().trim().toLowerCase() === "yes";
    out.push({
      host,
      port,
      protocol: https ? "https" : "http",
      country,
      anonymity,
    });
  });

  return out;
}

// ── spys.one (Playwright — port dirender via JS) ──────────────────────
async function scrapeSpysOne(): Promise<ScrapedProxy[]> {
  ensurePlaywrightBrowsersPath();
  // specifier non-literal → playwright tak ikut ter-bundle ke build web (worker-only)
  const pwName = "playwright";
  const { chromium } = (await import(pwName)) as typeof import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: UA });
    await page.goto(SOURCE_URL["spys-one"], {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2500); // beri waktu JS menghitung port

    const raw = await page.$$eval("table tr", (trs) => {
      const result: { host: string; port: string; type: string }[] = [];
      for (const tr of trs) {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 2) continue;
        const first = (tds[0]?.textContent || "").trim();
        const m = first.match(/(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})/);
        if (!m || !m[1] || !m[2]) continue;
        const type = (tds[1]?.textContent || "").toLowerCase();
        result.push({ host: m[1], port: m[2], type });
      }
      return result;
    });

    return raw.map((r) => {
      let protocol: ParsedProtocol = "http";
      if (r.type.includes("socks")) protocol = "socks5";
      else if (r.type.includes("https") || r.type.includes("ssl"))
        protocol = "https";
      return {
        host: r.host,
        port: parseInt(r.port, 10),
        protocol,
        country: null,
        anonymity: "unknown" as ScrapedAnonymity,
      };
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── proxyscrape.com (API v4 JSON — kaya: protocol/country/anonymity/ssl) ──
async function scrapeProxyscrape(): Promise<ScrapedProxy[]> {
  const url =
    "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=json&limit=2000";
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as { proxies?: ProxyScrapeItem[] };
  const list = Array.isArray(json?.proxies) ? json.proxies : [];
  const out: ScrapedProxy[] = [];

  for (const p of list) {
    const host = String(p.ip ?? "").trim();
    const port = Number(p.port);
    if (!IPV4_RE.test(host) || !port || port > 65535) continue;

    const proto = String(p.protocol ?? "").toLowerCase();
    let protocol: ParsedProtocol = "http";
    if (proto.includes("socks")) protocol = "socks5";
    else if (proto === "http" && p.ssl === true) protocol = "https";

    out.push({
      host,
      port,
      protocol,
      country: p.ip_data?.countryCode
        ? String(p.ip_data.countryCode).toUpperCase()
        : null,
      anonymity: mapAnonymity(String(p.anonymity ?? "")),
    });
  }

  return out;
}

// ── proxy-daily.com (HTML — kaya: protocol/country/anonymity/ssl) ──
async function scrapeDaily(): Promise<ScrapedProxy[]> {
  const params = new URLSearchParams({
    draw: "2",
    start: "0",
    length: "1000",
    "search[value]": "",
    "search[regex]": "false",
    _: String(Date.now()),
  });
  const columns = ["ip", "port", "protocol", "speed", "anonymity", "country"];
  columns.forEach((column, index) => {
    params.set(`columns[${index}][data]`, column);
    params.set(`columns[${index}][name]`, column);
    params.set(`columns[${index}][searchable]`, "true");
    params.set(`columns[${index}][orderable]`, "false");
    params.set(`columns[${index}][search][value]`, "");
    params.set(`columns[${index}][search][regex]`, "false");
  });

  const url = `https://proxy-daily.com/api/serverside/proxies?${params}`;

  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "application/json, text/javascript, */*; q=0.01",
      referer: SOURCE_URL["proxy-daily"],
      "x-requested-with": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: ProxyDailiyItem[] | unknown[][] };
  const list = Array.isArray(json?.data) ? json.data : [];

  const out: ScrapedProxy[] = [];

  for (const row of list) {
    const p = Array.isArray(row)
      ? {
          ip: row[0],
          port: row[1],
          protocol: row[2],
          anonymity: row[4],
          country: row[5],
        }
      : row;

    const host = cellToText(p.ip);
    const port = Number(cellToText(p.port));
    if (!IPV4_RE.test(host) || !port || port > 65535) continue;

    out.push({
      host,
      port,
      protocol: normalizeProtocol(p.protocol),
      country: normalizeCountry(p.country),
      anonymity: mapAnonymity(cellToText(p.anonymity)),
    });
  }
  return out;
}

// ── sunny9577.github.io tabel statis (Cheerio) ────────────────────────────────────

async function scrapeSunnySite(): Promise<ScrapedProxy[]> {
  const res = await fetch(
    "https://sunny9577.github.io/proxy-scraper/proxies.json",
    {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = (await res.json()) as SunnyProxyItem[];
  const out: ScrapedProxy[] = [];

  for (const p of Array.isArray(list) ? list : []) {
    const host = cellToText(p.ip);
    const port = Number(cellToText(p.port));
    if (!IPV4_RE.test(host) || !port || port > 65535) continue;

    out.push({
      host,
      port,
      protocol: normalizeProtocol(p.type),
      country: normalizeCountry(p.country),
      anonymity: mapAnonymity(cellToText(p.anonymity)),
    });
  }

  return out;
}

function applyFilters(
  list: ScrapedProxy[],
  filters: ScrapeFilters,
): ScrapedProxy[] {
  return list.filter((p) => {
    if (filters.country && p.country !== filters.country.toUpperCase())
      return false;
    if (filters.protocol && p.protocol !== filters.protocol) return false;
    if (filters.anonymity && p.anonymity !== filters.anonymity) return false;
    return true;
  });
}

/** Scrape satu sumber + terapkan filter. Dedup dalam-batch via Map host:port:proto. */
export async function scrapeSource(
  source: ScrapeSource,
  filters: ScrapeFilters = {},
): Promise<ScrapedProxy[]> {
  const list =
    source === "spys-one"
      ? await scrapeSpysOne()
      : source === "proxyscrape"
        ? await scrapeProxyscrape()
        : source === "proxy-daily"
          ? await scrapeDaily()
          : source === "sunny-proxy"
            ? await scrapeSunnySite()
            : await scrapeTableSite(SOURCE_URL[source]);

  const seen = new Set<string>();
  const deduped = list.filter((p) => {
    const key = `${p.protocol}://${p.host}:${p.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return applyFilters(deduped, filters);
}
