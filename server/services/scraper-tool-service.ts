/* eslint-disable @stylistic/lines-between-class-members */
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
import { ensurePlaywrightBrowsersPath } from "~~/server/utils/proxy-checker";

export class ProxyScraperToolService {
  private options: ToolsScrapeInput;
  private UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  private IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

  constructor(options: ToolsScrapeInput) {
    this.options = options;
  }

  async scrape(): Promise<ScrapedProxy[]> {
    const url = this.ensureSourceUrl(this.options);
    let result: ScrapedProxy[] = [];
    switch (this.options.sources) {
      case "proxyscrape":
        result = await this.scrapeProxyscrape(url);
        break;
      case "free-proxy-list":
      case "us-proxy":
      case "sslproxies":
        result = await this.scrapeTableSite(url);
        break;
      case "spys-one":
        result = await this.scrapeSpysOne(url);
        break;
      case "proxy-daily":
        result = await this.scrapeDaily(url);
        break;
      case "sunny-proxy":
        result = await this.scrapeSunnySite(url);
        break;
      case "geonode":
        result = await this.scrapeGeonode(url);
        break;
      case "hide-mn":
        result = await this.scrapeHideMn(url);
        break;
      case "openproxylist":
        result = await this.scrapeOpenProxyList(url);
        break;
      case "proxydb":
        result = await this.scrapeProxyDb(url);
        break;
      case "proxynova":
        result = await this.scrapeProxyNova(url);
        break;
      case "freeproxy-world":
        result = await this.scrapeFreeproxyWorld(url);
        break;
      default:
        result = await this.scrapeProxyscrape(url);
        break;
    }

    return result;
  }

  private ensureSourceUrl(opts: ToolsScrapeInput) {
    switch (opts.sources) {
      case "geonode":
        let geonodeUrl =
          "https://proxylist.geonode.com/api/proxy-list?page=1&limit=500&sort_by=lastChecked&sort_type=desc";
        if (opts.protocol) {
          geonodeUrl = geonodeUrl + `&protocols=${opts.protocol}`;
        }
        if (opts.country) {
          geonodeUrl = geonodeUrl + `&country=${opts.country.toUpperCase()}`;
        }
        if (opts.anonymity) {
          geonodeUrl = geonodeUrl + `&anonymityLevel=${opts.anonymity}`;
        }

        return geonodeUrl;
      case "hide-mn":
        const hideParams = new URLSearchParams();

        if (opts.protocol) {
          hideParams.set(
            "type",
            opts.protocol === "http"
              ? "h"
              : opts.protocol === "https"
                ? "s"
                : "5",
          );
        }
        if (opts.country) {
          hideParams.set("country", opts.country.toUpperCase());
        }

        if (opts.anonymity) {
          hideParams.set(
            "anon",
            opts.anonymity === "anonymous"
              ? "3"
              : opts.anonymity === "transparent"
                ? "2"
                : "4",
          );
        }
        return `https://hide.mn/en/proxy-list/?${hideParams.toString()}&start=64#list`;
      case "spys-one":
        return `https://spys.one/free-proxy-list/${opts.country?.toLowerCase() || "US"}/`;
      case "sslproxies":
        return "https://www.sslproxies.org/";
      case "free-proxy-list":
        return `https://free-proxy-list.net/`;
      case "us-proxy":
        return `https://www.us-proxy.org/`;
      case "proxy-daily":
        return `https://proxy-daily.com/api/serverside/proxies`;
      case "sunny-proxy":
        return `https://sunny9577.github.io/proxy-scraper/proxies.json`;
      case "openproxy":
        return `https://openproxy.space/list`;
      case "openproxylist":
        return `https://openproxylist.com/proxy/`;
      case "proxydb":
        let proxyDbUrl = `https://proxydb.net/?`;
        if (opts.protocol) {
          proxyDbUrl = proxyDbUrl + `&protocol=${opts.protocol}`;
        }
        if (opts.anonymity) {
          proxyDbUrl =
            proxyDbUrl +
            `&anonlvl=${opts.anonymity === "anonymous" ? "2" : opts.anonymity === "transparent" ? "1" : "4"}`;
        }
        if (opts.country) {
          proxyDbUrl = proxyDbUrl + `&country=${opts.country.toUpperCase()}`;
        }
        return proxyDbUrl;
      case "proxynova":
        let proxynovaUrl = "https://www.proxynova.com/proxy-server-list/";
        if (opts.country) {
          proxynovaUrl =
            proxynovaUrl + `country-${opts.country.toLowerCase()}/`;
        }

        return proxynovaUrl;
      case "freeproxy-world":
        let freeproxyWorldUrl = "https://www.freeproxy.world/?";
        if (opts.protocol) {
          freeproxyWorldUrl = freeproxyWorldUrl + `&type=${opts.protocol}`;
        }
        if (opts.anonymity) {
          freeproxyWorldUrl =
            freeproxyWorldUrl +
            `&anonymity=${opts.anonymity === "elite" ? "4" : "1"}`;
        }

        if (opts.country) {
          freeproxyWorldUrl =
            freeproxyWorldUrl + `&country=${opts.country.toUpperCase()}`;
        }

        return freeproxyWorldUrl;
      default:
        return `https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=json&limit=2000&protocol=${opts.protocol || "all"}&country=${opts.country?.toLowerCase() || "all"}&anonymity=${opts.anonymity || "all"}`;
    }
  }

  private async scrapeTableSite(url: string): Promise<ScrapedProxy[]> {
    const res = await fetch(url, {
      headers: { "user-agent": this.UA, accept: "text/html" },
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
      if (!this.IPV4_RE.test(host) || !port || port > 65535) return;
      const country = $(tds[2]).text().trim().toUpperCase() || null;
      const anonymity = this.mapAnonymity($(tds[4]).text());
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

  private async scrapeSpysOne(url: string): Promise<ScrapedProxy[]> {
    const res = await fetch(url, {
      headers: { "user-agent": this.UA, accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const scriptContext = this.createSpysOneScriptContext($);
    const out: ScrapedProxy[] = [];

    $("tr.spy1x, tr.spy1xx").each((_, tr) => {
      const tds = $(tr).children("td");
      if (tds.length < 4) return;

      const addressText = $(tds[0])
        .clone()
        .find("script")
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const host = addressText.match(/\d{1,3}(?:\.\d{1,3}){3}/)?.[0];
      const inlinePort = addressText.match(/:\s*(\d{1,5})/)?.[1];
      const port = Number(
        inlinePort ?? this.decodeSpysOnePort($, tds[0], scriptContext),
      );
      if (!host) return;
      if (!this.IPV4_RE.test(host) || !port || port > 65535) return;

      const typeText = $(tds[1]).text().replace(/\s+/g, " ").trim();
      const countryText = $(tds[3]).text().replace(/\s+/g, " ").trim();
      const country = countryText.match(/\b[A-Z]{2}\b/)?.[0] ?? null;

      out.push({
        host,
        port,
        protocol: this.mapProtocol(typeText),
        country,
        anonymity: this.mapSpysAnonymity($(tds[2]).text()),
      });
    });

    return out;
  }

  private async scrapeSpysOneWithPagination(
    url: string,
  ): Promise<ScrapedProxy[]> {
    try {
      const out: ScrapedProxy[] = [];
      const seen = new Set<string>();
      const pageUrl = new URL(url);
      const maxPagesEnv = Number(process.env.MAX_PAGES_PAGINATION_SCRAPE || 0);
      let totalPages = 1;

      for (let page = 1; page <= totalPages; page++) {
        const $ = await this.fetchProxyPage(pageUrl);
        if (page === 1) {
          totalPages = this.getSpyOneTotalPages($);
          if (maxPagesEnv > 0) {
            totalPages = Math.min(totalPages, maxPagesEnv);
          }
        }

        let pageCount = 0;

        $("table tbody tr").each((_, tr) => {
          const proxy = this.parseFreeproxyWorldRow($, tr);
          if (!proxy) return;

          const key = `${proxy.host}:${proxy.port}`;
          if (seen.has(key)) return;
          seen.add(key);
          pageCount++;
          out.push(proxy);
        });

        if (pageCount === 0) break;
      }

      return out;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private async scrapeProxyscrape(url: string): Promise<ScrapedProxy[]> {
    const res = await fetch(url, {
      headers: { "user-agent": this.UA, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as { proxies?: ProxyScrapeItem[] };
    const list = Array.isArray(json?.proxies) ? json.proxies : [];
    const out: ScrapedProxy[] = [];

    for (const p of list) {
      const host = String(p.ip ?? "").trim();
      const port = Number(p.port);
      if (!this.IPV4_RE.test(host) || !port || port > 65535) continue;

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
        anonymity: this.mapAnonymity(String(p.anonymity ?? "")),
      });
    }

    return out;
  }

  private async scrapeDaily(url: string): Promise<ScrapedProxy[]> {
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

    const finalUrl = `${url}?${params}`;

    const res = await fetch(finalUrl, {
      headers: {
        "user-agent": this.UA,
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: "https://proxy-daily.com/",
        "x-requested-with": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: ProxyDailiyItem[] | unknown[][];
    };
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

      const host = this.cellToText(p.ip);
      const port = Number(this.cellToText(p.port));
      if (!this.IPV4_RE.test(host) || !port || port > 65535) continue;

      out.push({
        host,
        port,
        protocol: this.mapProtocol(p.protocol as string),
        country: this.normalizeCountry(p.country),
        anonymity: this.mapAnonymity(this.cellToText(p.anonymity)),
      });
    }
    return out;
  }

  private async scrapeSunnySite(url: string): Promise<ScrapedProxy[]> {
    const res = await fetch(url, {
      headers: { "user-agent": this.UA, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as SunnyProxyItem[];
    const out: ScrapedProxy[] = [];

    for (const p of Array.isArray(list) ? list : []) {
      const host = this.cellToText(p.ip);
      const port = Number(this.cellToText(p.port));
      if (!this.IPV4_RE.test(host) || !port || port > 65535) continue;

      out.push({
        host,
        port,
        protocol: this.mapProtocol(p.type as string),
        country: this.normalizeCountry(p.country),
        anonymity: this.mapAnonymity(this.cellToText(p.anonymity)),
      });
    }

    return out;
  }

  private async scrapeGeonode(url: string): Promise<ScrapedProxy[]> {
    const out: ScrapedProxy[] = [];
    const seen = new Set<string>();
    const firstUrl = new URL(url);
    const limit = Number(firstUrl.searchParams.get("limit") || 500);
    let totalPages = 1;

    for (let page = 1; page <= totalPages; page++) {
      firstUrl.searchParams.set("page", String(page));
      firstUrl.searchParams.set("limit", String(limit));

      const res = await fetch(firstUrl.toString(), {
        headers: { "user-agent": this.UA, accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as {
        data?: ProxyGenodeItem[];
        total?: number;
        page?: number;
        limit?: number;
      };
      const list = Array.isArray(json?.data) ? json.data : [];

      if (page === 1) {
        const responseLimit = Number(json.limit || limit);
        const total = Number(json.total || list.length);
        totalPages = Math.max(1, Math.ceil(total / responseLimit));
      }

      if (list.length === 0) break;

      for (const p of list) {
        const host = String(p.ip ?? "").trim();
        const port = Number(p.port);
        if (!this.IPV4_RE.test(host) || !port || port > 65535) continue;

        const key = `${host}:${port}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const proto = String(p.protocols?.[0] ?? "").toLowerCase();
        let protocol: ParsedProtocol = "http";
        if (proto.includes("socks")) protocol = "socks5";
        else if (proto.includes("https")) protocol = "https";

        out.push({
          host,
          port,
          protocol,
          country: p.country ? String(p.country).toUpperCase() : null,
          anonymity: this.mapAnonymity(String(p.anonymityLevel ?? "")),
        });
      }
    }

    return out;
  }

  private async scrapeHideMn(url: string): Promise<ScrapedProxy[]> {
    const out: ScrapedProxy[] = [];

    try {
      const { PlaywrightCrawler } = await import("crawlee");
      const executablePath = this.getPlaywrightBrowserPath();
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      const crawler = new PlaywrightCrawler({
        retryOnBlocked: false,
        maxRequestsPerCrawl: 1,
        launchContext: {
          launchOptions: {
            headless: true,
            ...(executablePath ? { executablePath } : {}),
            args: [
              "--disable-blink-features=AutomationControlled",
              "--disable-dev-shm-usage",
              "--no-sandbox",
            ],
          },
        },
        browserPoolOptions: {
          useFingerprints: true,
          fingerprintOptions: {
            fingerprintGeneratorOptions: {
              browsers: ["chrome"],
              operatingSystems: ["windows"],
            },
          },
        },

        maxRequestRetries: 2,

        preNavigationHooks: [
          async ({ page }, gotoOptions) => {
            await page.setExtraHTTPHeaders({
              accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
              "cache-control": "no-cache",
              pragma: "no-cache",
              referer: "https://hide.mn/en/proxy-list/",
            });

            gotoOptions.waitUntil = "domcontentloaded";
          },
        ],

        async requestHandler({ page, response, handleCloudflareChallenge }) {
          if (typeof handleCloudflareChallenge === "function") {
            await handleCloudflareChallenge({ sleepSecs: 5 });
          }

          if (response?.status() === 403) {
            throw new Error(
              "Hide.mn returned HTTP 403. The site blocked this crawler session before the proxy table loaded.",
            );
          }

          await page.waitForSelector("table tbody tr", { timeout: 30_000 });

          const rows = await page.$$eval("table tbody tr", (trs) =>
            trs.map((tr) => {
              const tds = Array.from(tr.querySelectorAll("td"));
              const countryCell = tds[2] ?? null;
              const flagClass =
                countryCell
                  ?.querySelector("i[class*='flag-icon-']")
                  ?.className?.toString() ?? "";
              const country =
                flagClass.match(/flag-icon-([a-z]{2})/i)?.[1]?.toUpperCase() ??
                null;

              return {
                host: tds[0]?.textContent?.trim() ?? "",
                port: tds[1]?.textContent?.trim() ?? "",
                country,
                protocol: tds[4]?.textContent?.trim() ?? "",
                anonymity: tds[5]?.textContent?.trim() ?? "",
              };
            }),
          );

          for (const row of rows) {
            const host = String(row.host).trim();
            const port = Number(row.port);
            if (!self.IPV4_RE.test(host) || !port || port > 65535) continue;

            out.push({
              host,
              port,
              protocol: self.mapProtocol(row.protocol),
              country: row.country,
              anonymity: self.mapHideMnAnonymity(row.anonymity),
            });
          }
        },

        async failedRequestHandler({ request, log }) {
          log.error(
            `Gagal memproses ${request.url} setelah beberapa kali percobaan.`,
          );
        },
      });
      await crawler.run([url]);
      return out;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private async scrapeOpenProxyList(url: string): Promise<ScrapedProxy[]> {
    const out: ScrapedProxy[] = [];

    try {
      const { PlaywrightCrawler } = await import("crawlee");
      const executablePath = this.getPlaywrightBrowserPath();
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      const crawler = new PlaywrightCrawler({
        retryOnBlocked: false,
        maxRequestsPerCrawl: 1,
        launchContext: {
          launchOptions: {
            headless: true,
            ...(executablePath ? { executablePath } : {}),
            args: [
              "--disable-blink-features=AutomationControlled",
              "--disable-dev-shm-usage",
              "--no-sandbox",
            ],
          },
        },
        browserPoolOptions: {
          useFingerprints: true,
          fingerprintOptions: {
            fingerprintGeneratorOptions: {
              browsers: ["chrome"],
              operatingSystems: ["windows"],
            },
          },
        },

        maxRequestRetries: 2,

        preNavigationHooks: [
          async ({ page }, gotoOptions) => {
            await page.setExtraHTTPHeaders({
              accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
              "cache-control": "no-cache",
              pragma: "no-cache",
              referer: "https://hide.mn/en/proxy-list/",
            });

            gotoOptions.waitUntil = "domcontentloaded";
          },
        ],

        async requestHandler({ page, response, handleCloudflareChallenge }) {
          if (typeof handleCloudflareChallenge === "function") {
            await handleCloudflareChallenge({ sleepSecs: 5 });
          }

          if (response?.status() === 403) {
            throw new Error(
              "Hide.mn returned HTTP 403. The site blocked this crawler session before the proxy table loaded.",
            );
          }

          await page.waitForSelector("table tbody tr", { timeout: 30_000 });

          const rows = await page.$$eval("table tbody tr", (trs) =>
            trs.map((tr) => {
              const tds = Array.from(tr.querySelectorAll("td"));

              // <td data-label="Type" class="fw-bold small"><a href="/proxy/type/socks4/">SOCKS4</a></td>
              const protocol =
                tds[3]?.querySelector("a")?.textContent?.trim() ?? "";

              // <td data-label="IP Address"><a href="/proxy/18289534">37.18.73.60</a></td>
              const host =
                tds[1]?.querySelector("a")?.textContent?.trim() ?? "";

              return {
                host,
                port: tds[2]?.textContent?.trim() ?? "",
                country: tds[4]?.textContent?.trim() ?? null,
                protocol,
                anonymity: tds[7]?.textContent?.trim() ?? "",
              };
            }),
          );

          for (const row of rows) {
            const host = String(row.host).trim();
            const port = Number(row.port);
            if (!self.IPV4_RE.test(host) || !port || port > 65535) continue;

            out.push({
              host,
              port,
              protocol: self.mapProtocol(row.protocol),
              country: row.country,
              anonymity: self.mapHideMnAnonymity(row.anonymity),
            });
          }
        },

        async failedRequestHandler({ request, log }) {
          log.error(
            `Gagal memproses ${request.url} setelah beberapa kali percobaan.`,
          );
        },
      });
      await crawler.run([url]);
      return out;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private async scrapeProxyDb(url: string): Promise<ScrapedProxy[]> {
    const out: ScrapedProxy[] = [];
    const seen = new Set<string>();
    const pageUrl = new URL(url);
    const visitedOffsets = new Set<number>();
    const maxPagesEnv = Number(process.env.PROXYDB_MAX_PAGES || 0);
    let currentOffset = Number(pageUrl.searchParams.get("offset") || 0);
    let pageCount = 0;

    while (!visitedOffsets.has(currentOffset)) {
      visitedOffsets.add(currentOffset);
      pageCount++;
      pageUrl.searchParams.set("offset", String(currentOffset));

      const $ = await this.fetchProxyDbPage(pageUrl);
      let parsedInPage = 0;

      $("table tbody tr").each((_, tr) => {
        const proxy = this.parseProxyDbRow($, tr);
        if (!proxy) return;

        const key = `${proxy.host}:${proxy.port}`;
        if (seen.has(key)) return;
        seen.add(key);
        parsedInPage++;
        out.push(proxy);
      });

      if (parsedInPage === 0) break;
      if (maxPagesEnv > 0 && pageCount >= maxPagesEnv) break;

      const nextOffset = this.getProxyDbNextOffset($);
      if (nextOffset == null || nextOffset <= currentOffset) break;

      currentOffset = nextOffset;
    }

    return out;
  }

  private async fetchProxyDbPage(url: URL) {
    const res = await fetch(url.toString(), {
      headers: {
        "user-agent": this.UA,
        accept: "text/html",
        Referer: url.origin,
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return cheerio.load(await res.text());
  }

  private getProxyDbNextOffset($: cheerio.CheerioAPI) {
    let nextOffset: number | null = null;

    $("a[href*='offset=']").each((_, link) => {
      const text = $(link).text().replace(/\s+/g, " ").trim().toLowerCase();
      if (!text.includes("next")) return;

      const href = $(link).attr("href");
      if (!href) return;

      const offset = Number(
        new URL(href, "https://proxydb.net/").searchParams.get("offset"),
      );
      if (Number.isFinite(offset)) nextOffset = offset;
    });

    return nextOffset;
  }

  private parseProxyDbRow($: cheerio.CheerioAPI, tr: any): ScrapedProxy | null {
    const tds = $(tr).find("td");
    if (tds.length < 4) return null;

    const host = $(tds[0]).find("a").text().trim();
    const port = parseInt($(tds[1]).find("a").text().trim(), 10);
    if (!this.IPV4_RE.test(host) || !port || port > 65535) return null;

    const country = $(tds[3]).find("abbr").text().trim().toUpperCase() || null;

    return {
      host,
      port,
      protocol: this.mapProtocol($(tds[3]).text()),
      country,
      anonymity: this.mapAnonymity($(tds[2]).text()),
    };
  }

  private async scrapeProxyNova(url: string): Promise<ScrapedProxy[]> {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": this.UA,
          accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const $ = cheerio.load(html);

      const rows = $("tr[data-proxy-id]");
      if (rows.length === 0) {
        const fallbackRows = $("table tbody tr");
        return this.parseRowsProxyNova(fallbackRows, $);
      }

      return this.parseRowsProxyNova(rows, $);
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private async scrapeFreeproxyWorld(url: string): Promise<ScrapedProxy[]> {
    try {
      const out: ScrapedProxy[] = [];
      const seen = new Set<string>();
      const pageUrl = new URL(url);
      const maxPagesEnv = Number(process.env.MAX_PAGES_PAGINATION_SCRAPE || 0);
      let totalPages = 1;

      for (let page = 1; page <= totalPages; page++) {
        pageUrl.searchParams.set("page", String(page));

        const $ = await this.fetchProxyPage(pageUrl);
        if (page === 1) {
          totalPages = this.getFreeproxyWorldTotalPages($);
          if (maxPagesEnv > 0) {
            totalPages = Math.min(totalPages, maxPagesEnv);
          }
        }

        let pageCount = 0;

        $("table tbody tr").each((_, tr) => {
          const proxy = this.parseFreeproxyWorldRow($, tr);
          if (!proxy) return;

          const key = `${proxy.host}:${proxy.port}`;
          if (seen.has(key)) return;
          seen.add(key);
          pageCount++;
          out.push(proxy);
        });

        if (pageCount === 0) break;
      }

      return out;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private getFreeproxyWorldTotalPages($: cheerio.CheerioAPI) {
    let totalPages = 1;

    $(".pagination a[href*='page=']").each((_, link) => {
      const href = $(link).attr("href");
      if (!href) return;

      const parsed = new URL(href, "https://www.freeproxy.world/");
      const page = Number(parsed.searchParams.get("page"));
      if (Number.isFinite(page) && page > totalPages) {
        totalPages = page;
      }
    });

    return totalPages;
  }

  private parseFreeproxyWorldRow(
    $: cheerio.CheerioAPI,
    tr: any,
  ): ScrapedProxy | null {
    const tds = $(tr).find("td");
    if (tds.length < 4) return null;

    const host = $(tds[0]).text().trim();
    const port = parseInt($(tds[1]).text().trim(), 10);
    if (!this.IPV4_RE.test(host) || !port || port > 65535) return null;

    const countryHref = $(tds[2]).find("a[href*='country=']").attr("href");
    const country = countryHref
      ? new URL(countryHref, "https://www.freeproxy.world/").searchParams
          .get("country")
          ?.toUpperCase() || null
      : null;

    return {
      host,
      port,
      protocol: this.mapProtocol($(tds[5]).text()),
      country,
      anonymity: this.mapFreeproxyWorldAnonymity(
        $(tds[6]).find("a").text().trim(),
      ),
    };
  }

  private getSpyOneTotalPages($: cheerio.CheerioAPI) {
    let totalPages = 1;

    $("table tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 4) return;

      const seletcs = $(tds[3]).find("font").find("select");
      if (seletcs.length === 0) return;
      totalPages = seletcs.length;
    });

    return totalPages;
  }

  private async fetchProxyPage(url: URL) {
    const referrer = url.origin;
    const res = await fetch(url.toString(), {
      headers: {
        "user-agent": this.UA,
        accept: "text/html",
        Referer: referrer,
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return cheerio.load(await res.text());
  }

  private mapAnonymity(s: string): ScrapedAnonymity {
    const v = s.toLowerCase();
    if (v.includes("elite")) return "elite";
    if (v.includes("anonymous")) return "anonymous";
    if (v.includes("transparent")) return "transparent";
    return "unknown";
  }

  private mapSpysAnonymity(s: string): ScrapedAnonymity {
    const v = s.toLowerCase();
    if (v.includes("hia") || v.includes("high")) return "elite";
    if (v.includes("anm") || v.includes("anonymous")) return "anonymous";
    if (v.includes("noa") || v.includes("transparent")) return "transparent";
    return this.mapAnonymity(s);
  }

  private mapHideMnAnonymity(s: string): ScrapedAnonymity {
    const v = s.toLowerCase();
    if (v.includes("high") || v.includes("elite")) return "elite";
    if (v.includes("average") || v.includes("anonymous")) return "anonymous";
    if (v.includes("low") || v.includes("transparent")) return "transparent";
    return "unknown";
  }

  private mapFreeproxyWorldAnonymity(s: string): ScrapedAnonymity {
    const v = s.toLowerCase();
    if (v.includes("high") || v.includes("elite")) return "elite";
    if (v.includes("anonymous")) return "anonymous";
    if (v === "no" || v.includes("transparent")) return "transparent";
    return this.mapAnonymity(s);
  }

  private mapProtocol(s: string): ParsedProtocol {
    const v = s.toLowerCase();
    if (v.includes("socks")) return "socks5";
    if (v.includes("https") || v.includes("ssl")) return "https";
    return "http";
  }

  private createSpysOneScriptContext($: cheerio.CheerioAPI) {
    const context = createContext({});

    $("script:not([src])").each((_, script) => {
      const code = $(script).html() ?? "";
      if (!code.includes("eval(function")) return;

      try {
        runInContext(code, context, { timeout: 500 });
      } catch {
        /* ignore SPYS.ONE helper decode failures */
      }
    });

    return context;
  }

  private decodeSpysOnePort(
    $: cheerio.CheerioAPI,
    td: any,
    context: ReturnType<typeof createContext>,
  ): string | null {
    let port: string | null = null;

    $(td)
      .find("script")
      .each((_, script) => {
        if (port) return;

        const code = $(script).html() ?? "";
        if (!code.includes("document.write")) return;

        const writes: string[] = [];
        const documentProxy = {
          write: (value: unknown) => {
            writes.push(String(value));
          },
        };

        try {
          (context as Record<string, unknown>).document = documentProxy;
          runInContext(code, context, { timeout: 500 });
        } catch {
          return;
        }

        const text = writes.join("");
        port = text.match(/(\d{1,5})/)?.[1] ?? null;
      });

    return port;
  }

  private parseRowsProxyNova(
    rows: cheerio.Cheerio<any>,
    $: cheerio.CheerioAPI,
  ): ScrapedProxy[] {
    const out: ScrapedProxy[] = [];
    let parsedCount = 0;
    let skippedCount = 0;

    rows.each((index, tr) => {
      const tds = $(tr).find("td");

      if (index < 3) {
        console.log(`[ProxyNova] Row ${index} has ${tds.length} cells`);
      }

      if (tds.length < 7) {
        skippedCount++;
        return;
      }

      const host = this.extractHostProxyNova($(tds[0]));
      if (!host || !this.IPV4_RE.test(host)) {
        skippedCount++;
        return;
      }

      const portText = $(tds[1]).text().trim();
      const port = parseInt(portText, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        skippedCount++;
        return;
      }

      const country = $(tds[5]).find("a").text().trim();

      const anonymityText = $(tds[6]).find("span").text().trim().toLowerCase();
      const anonymity = this.mapAnonymity(anonymityText);

      const protocol = this.inferProtocol(port, $(tds[3]).text());

      if (out.length < 3) {
        console.log(`[ProxyNova] Sample ${out.length + 1}:`, {
          host,
          port,
          country,
          anonymity,
          protocol,
          raw: $(tds[0]).html()?.substring(0, 100),
        });
      }

      out.push({
        host,
        port,
        protocol,
        country: mapCountryCodeFromName(country),
        anonymity,
      });

      parsedCount++;
    });

    console.log(`[ProxyNova] Parsed: ${parsedCount}, Skipped: ${skippedCount}`);
    return out;
  }

  private getPlaywrightBrowserPath() {
    ensurePlaywrightBrowsersPath();

    const configured = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const fallbackRoot = path.resolve(process.cwd(), "browsers");
    const configuredPath = configured
      ? path.resolve(process.cwd(), configured)
      : fallbackRoot;

    let root = configuredPath.toLowerCase().endsWith("chrome.exe")
      ? path.dirname(path.dirname(configuredPath))
      : configuredPath;
    if (!fs.existsSync(root)) root = fallbackRoot;

    if (fs.existsSync(root)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = root;
    }

    const directExe = configuredPath.toLowerCase().endsWith("chrome.exe")
      ? configuredPath
      : path.join(root, "chromium-1223", "chrome-win64", "chrome.exe");
    if (fs.existsSync(directExe)) return directExe;
    if (!fs.existsSync(root)) return "";

    const chromiumDir = fs
      .readdirSync(root, { withFileTypes: true })
      .find(
        (entry) => entry.isDirectory() && entry.name.startsWith("chromium-"),
      );
    if (!chromiumDir) return "";

    const discoveredExe = path.join(
      root,
      chromiumDir.name,
      "chrome-win64",
      "chrome.exe",
    );
    return fs.existsSync(discoveredExe) ? discoveredExe : "";
  }

  private cellToText(value: unknown): string {
    if (Array.isArray(value)) return value.map(this.cellToText).join(" ");
    if (value == null) return "";
    return String(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }
  private normalizeCountry(value: unknown): string | null {
    const raw = this.cellToText(value);
    if (!raw) return null;

    const iso = raw.match(/\b[A-Z]{2}\b/)?.[0];
    if (iso) return iso;
    return null;
  }

  private inferProtocol(port: number, typeText: string): ParsedProtocol {
    const typeLower = typeText.toLowerCase();

    if (port === 1080 || port === 1081 || port === 1082) {
      return "socks5";
    }

    if (typeLower.includes("socks")) return "socks5";
    if (typeLower.includes("https") || typeLower.includes("ssl"))
      return "https";

    if (port === 443 || port === 8443) return "https";
    if (port === 80 || port === 8080 || port === 3128) return "http";

    return "http";
  }

  private extractHostProxyNova(td: cheerio.Cheerio<any>): string | null {
    const text = td.text().trim();

    const html = td.html() || "";
    const scriptMatch = html.match(
      /<script>document\.write\(([^)]+)\)<\/script>/,
    );

    if (scriptMatch) {
      const cleanHtml = html.replace(/<script>.*?<\/script>/, "").trim();
      const ipMatch = cleanHtml.match(/(\d{1,3}\.){3}\d{1,3}/);
      if (ipMatch) {
        return ipMatch[0];
      }
    }

    const ipMatch = text.match(/(\d{1,3}\.){3}\d{1,3}/);
    if (ipMatch) {
      return ipMatch[0];
    }

    return null;
  }
}
