import {
  chromium,
  firefox,
  webkit,
  type BrowserType,
  type Page,
} from "playwright";
import { FingerprintGenerator } from "fingerprint-generator";
import { FingerprintInjector } from "fingerprint-injector";
import type { ProxyPool } from "@prisma/client";
import http from "node:http";
import https from "node:https";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

interface BuiltGatewayProxy extends PlaywrightProxy {
  url: string;
}

interface ProxyIpCheck {
  url: string;
  status: number | null;
  body: string | null;
}

interface ProxyTesterResult {
  proxy: {
    server: string;
    username: string;
  };
  ipChecks: ProxyIpCheck[];
  target: {
    url: string;
    finalUrl: string | null;
    status: number | null;
    title: string | null;
  };
  simulation?: BrowserSimulateResult;
}

export class ProxyTesterService {
  private fingerprintGenerator: FingerprintGenerator;
  private fingerprintInjector: FingerprintInjector;
  private activeSessions: Map<string, SessionBrowser> = new Map();
  private options: TestProxyInput;
  private userId: string;

  constructor(options: TestProxyInput, userId: string) {
    this.options = options;
    this.userId = userId;
    this.fingerprintGenerator = new FingerprintGenerator();
    this.fingerprintInjector = new FingerprintInjector();
  }

  async processRequest(): Promise<ProxyTesterResult> {
    const proxyPool = await prisma.proxyPool.findFirst({
      where: {
        id: this.options.proxyPoolId,
        userId: this.userId,
        deletedAt: null,
      },
    });
    if (!proxyPool) {
      throw new Error("Proxy pool not found");
    }

    const sessionId = this.createGatewaySessionId("request");
    const proxy = this.buildGatewayProxy(proxyPool, sessionId);
    if (!proxy?.server) throw new Error("Invalid gateway proxy configuration");

    const ipChecks: ProxyIpCheck[] = [];
    for (const url of [
      "https://httpbin.org/ip",
      "https://api.ipify.org?format=json",
    ]) {
      ipChecks.push(await this.requestViaProxy(url, proxy.url));
    }

    const target = await this.requestViaProxy(this.options.targetUrl, proxy.url);

    return {
      proxy: {
        server: proxy.server,
        username: proxy.username ?? proxyPool.gatewayUsername,
      },
      ipChecks,
      target: {
        url: this.options.targetUrl,
        finalUrl: this.options.targetUrl,
        status: target.status,
        title: null,
      },
    };
  }

  async processSession(): Promise<ProxyTesterResult> {
    const proxyPool = await prisma.proxyPool.findFirst({
      where: {
        id: this.options.proxyPoolId,
        userId: this.userId,
        deletedAt: null,
      },
    });
    if (!proxyPool) {
      throw new Error("Proxy pool not found");
    }

    const sessionId = this.createGatewaySessionId("browser");
    const proxy = this.buildGatewayProxy(proxyPool, sessionId);
    if (!proxy?.server) throw new Error("Invalid gateway proxy configuration");

    const referrer = this.buildReferrer(
      this.options.targetUrl,
      this.options.trafficSource,
      this.options.referer ?? null,
    );

    console.log("Launching browser", {
      referrer,
      engine: this.options.engine,
      proxy: proxy ? `${proxy.server} (${proxy.username})` : "none",
    });

    let sessionBrowser: SessionBrowser | null = null;

    const behaviourConfig = getBehaviourProfile(this.options.behaviour);

    try {
      sessionBrowser = await this.launchBrowser(proxyPool, sessionId);

      const page = await sessionBrowser.context.newPage();
      const ipChecks = await this.runBrowserIpChecks(page);

      const simResult = await this.simulateBehaviour(
        page,
        this.options.targetUrl,
        behaviourConfig,
        referrer ?? undefined,
      );

      console.log("Simulated behaviour", simResult);

      return {
        proxy: {
          server: proxy.server,
          username: proxy.username ?? proxyPool.gatewayUsername,
        },
        ipChecks,
        target: {
          url: this.options.targetUrl,
          finalUrl: page.url(),
          status: null,
          title: await page.title().catch(() => null),
        },
        simulation: simResult,
      };
    } catch (error) {
      console.error("Error launching browser", error);
      throw error;
    } finally {
      await sessionBrowser?.close().catch(() => {});
    }
  }

  // ============================================================
  // Browser Context Instance
  // ============================================================
  async launchBrowser(
    proxyPool: ProxyPool,
    gatewaySessionId?: string,
  ): Promise<SessionBrowser> {
    const hint = getFingerprintProfile(
      this.options.fingerprint,
    ) as FingerprintHint;

    const isMobile =
      hint?.isMobile ||
      hint?.deviceType === "MOBILE" ||
      this.isMobileDeviceFromFingerprint(hint);
    const isWebKit = this.options.engine === "WEBKIT";

    const browserVersion = hint.browserVersion;

    const fingerprint = this.fingerprintGenerator.getFingerprint({
      devices: [isMobile ? "mobile" : "desktop"],
      operatingSystems: this.resolveOs(hint.osName) as any,
      browsers: this.resolveBrowser(
        this.options.engine,
        hint.browserName,
      ) as any,
      locales: hint.language ? [hint.language] : ["en-US", "en-GB"],
    });

    const userAgent =
      hint.userAgent ||
      (fingerprint as any).navigator?.userAgent ||
      fingerprint.headers["user-agent"] ||
      "";
    const timezone = hint.timezone || "America/New_York";
    const viewport = {
      width: hint.viewportWidth || (isMobile ? 390 : 1366),
      height: hint.viewportHeight || (isMobile ? 844 : 768),
    };

    const launcher = this.engineLauncher(this.options.engine);

    const proxy = this.buildGatewayProxy(proxyPool, gatewaySessionId);

    const browser = await launcher.launch({
      headless: this.options.headless ?? true,
      timeout: this.options.launchTimeout ?? 30_000,
      ...(proxy
        ? {
            proxy: {
              server: proxy.server as string,
              username: proxy.username,
              password: proxy.password,
              bypass: proxy.bypass,
            },
          }
        : {}),
      args:
        this.options.engine === "CHROMIUM"
          ? this.getBrowserArgs(this.options.engine)
          : [],
    });

    const extraHTTPHeaders: Record<string, string> = {
      "Accept-Language":
        fingerprint.headers["accept-language"] ?? "en-US,en;q=0.9",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    };
    if (this.options.referer) {
      extraHTTPHeaders["Referer"] = this.options.referer;
    }

    if (this.options.engine === "CHROMIUM") {
      const majorVersion = browserVersion?.split(".")[0] ?? "120";
      extraHTTPHeaders["Sec-Ch-Ua"] =
        `"Google Chrome";v="${majorVersion}", "Chromium";v="${majorVersion}", "Not?A_Brand";v="24"`;
      extraHTTPHeaders["Sec-Ch-Ua-Mobile"] = isMobile ? "?1" : "?0";
      extraHTTPHeaders["Sec-Ch-Ua-Platform"] = this.getSecChUaPlatform(
        hint.osName as OSName,
      );
    }

    const context = await browser.newContext({
      viewport,
      userAgent,
      isMobile,
      hasTouch: isMobile,
      locale: hint.language ?? "en-US",
      timezoneId: timezone,
      extraHTTPHeaders,
      // proxy free sering MITM/cert invalid → wajib agar tidak ERR_CERT_*
      ignoreHTTPSErrors: true,
      ...(proxy
        ? {
            proxy: {
              server: proxy.server as string,
              username: proxy.username,
              password: proxy.password,
              bypass: proxy.bypass,
            },
          }
        : {}),
    });

    await this.fingerprintInjector
      .attachFingerprintToPlaywright(context, fingerprint)
      .catch(() => {});

    await context.addInitScript(
      this.getClientHintsScript(hint, this.options.engine),
    );

    const page = await context.newPage();

    if (this.options.navigationTimeout) {
      context.setDefaultNavigationTimeout(this.options.navigationTimeout);
    }

    const sessionId = `session_${Date.now()}_${Math.random()}`;
    const supportsWheel = !isMobile;

    const session: SessionBrowser = {
      browser,
      context,
      timezone,
      userAgent,
      isMobile,
      capabilities: {
        supportsWheel,
        isMobile,
        isWebKit,
      },
      close: async () => {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        this.activeSessions.delete(sessionId);
      },
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  private getClientHintsScript(
    hint: FingerprintHint,
    engine: BrowserEngine,
  ): string {
    const isMobile = hint.isMobile ?? hint.deviceType === "MOBILE";
    const browserVersion = hint.browserVersion;
    const chromeVersion = browserVersion?.split(".")[0];
    const browsserName = hint.browserName ?? "CHROME";
    const osName = hint.osName ?? "WINDOWS";
    const osPlatform = this.getSecChUaPlatform(hint.osName as OSName).replace(
      /"/g,
      "",
    );
    const userAgentDataScript =
      engine === "CHROMIUM"
        ? `
      try {
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands: [
              { brand: 'Google Chrome', version: '${chromeVersion ?? "120"}' },
              { brand: 'Chromium', version: '${chromeVersion ?? "120"}' },
              { brand: 'Not?A_Brand', version: '24' }
            ],
            mobile: ${isMobile},
            platform: '${osPlatform}',
            getHighEntropyValues: async (hints) => {
              const result = {};
              if (hints.includes('architecture')) result.architecture = 'x86';
              if (hints.includes('model')) result.model = '';
              if (hints.includes('platformVersion')) result.platformVersion = '${hint.osVersion ?? ""}';
              if (hints.includes('uaFullVersion')) result.uaFullVersion = '${browserVersion ?? chromeVersion ?? "120"}';
              if (hints.includes('bitness')) result.bitness = '64';
              if (hints.includes('fullVersionList')) result.fullVersionList = [];
              if (hints.includes('wow64')) result.wow64 = false;
              return result;
            }
          }),
          configurable: true
        });
      } catch(e) {}
    `
        : "";

    return `
      ${userAgentDataScript}

      // Override webdriver
      try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true }); } catch(e) {}
      try { delete Object.getPrototypeOf(navigator).webdriver; } catch(e) {}

      // Override plugins
      try {
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [
              { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
              { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ];
            plugins.item = (i) => plugins[i];
            plugins.namedItem = (name) => plugins.find(p => p.name === name);
            return plugins;
          },
          configurable: true
        });
      } catch(e) {}

      // Override languages
      try { Object.defineProperty(navigator, 'languages', { get: () => ['${hint.locale ?? hint.language ?? "en-US"}', 'en'], configurable: true }); } catch(e) {}
      
      // Override hardware concurrency
      try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true }); } catch(e) {}
      
      // Override device memory
      try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true }); } catch(e) {}

      // Disable WebRTC/STUN IP leak. HTTP(S) traffic can go through the proxy
      // while WebRTC still exposes the desktop public IP to tracking scripts.
      try {
        Object.defineProperty(window, 'RTCPeerConnection', { get: () => undefined, configurable: true });
        Object.defineProperty(window, 'webkitRTCPeerConnection', { get: () => undefined, configurable: true });
        Object.defineProperty(window, 'mozRTCPeerConnection', { get: () => undefined, configurable: true });
        Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined, configurable: true });
      } catch(e) {}
      
      // Override WebGL vendor
      try {
        if (typeof WebGLRenderingContext !== 'undefined') {
          const webglVendor = ${JSON.stringify(getWebGLVendor(engine, osName as OSName, browsserName as BrowserName))};
          const getParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return webglVendor.vendor;
            if (parameter === 37446) return webglVendor.renderer;
            return getParameter.call(this, parameter);
          };
        }
      } catch(e) {}

      // Canvas fingerprint noise
      try {
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
          try {
            if (this.width > 0 && this.height > 0) {
              const ctx = this.getContext('2d');
              if (ctx) {
                const imageData = ctx.getImageData(0, 0, this.width, this.height);
                for (let i = 0; i < imageData.data.length; i += 4) {
                  if (Math.random() < 0.01) {
                    imageData.data[i] = imageData.data[i] ^ (Math.random() * 4);
                  }
                }
                ctx.putImageData(imageData, 0, 0);
              }
            }
          } catch(e) {}
          return originalToDataURL.call(this, type, quality);
        };
      } catch(e) {}
    `;
  }

  private getBrowserArgs(engine: BrowserEngine): string[] {
    const commonArgs = [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-web-security",
      "--disable-features=BlockInsecurePrivateNetworkRequests",
      "--disable-features=PasswordImport",
      "--disable-sync",
      "--disable-default-apps",
      "--disable-translate",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-client-side-phishing-detection",
      "--disable-component-extensions-with-background-pages",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-features=AudioServiceOutOfProcess",
      "--disable-hang-monitor",
      "--disable-ipc-flooding-protection",
      "--disable-notifications",
      "--disable-offer-store-unmasked-wallet-cards",
      "--disable-popup-blocking",
      "--disable-print-preview",
      "--disable-prompt-on-repost",
      "--disable-renderer-backgrounding",
      "--disable-setuid-sandbox",
      "--disable-speech-api",
      "--disable-wake-on-wifi",
      "--enable-features=NetworkService,NetworkServiceInProcess",
      "--force-color-profile=srgb",
      "--metrics-recording-only",
      "--no-first-run",
      "--no-pings",
      "--no-zygote",
      "--password-store=basic",
      "--use-mock-keychain",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--disable-quic",
    ];

    if (engine === "CHROMIUM") {
      return commonArgs;
    }

    return [];
  }

  private getSecChUaPlatform(osName?: OSName): string {
    switch (osName) {
      case "WINDOWS":
        return '"Windows"';
      case "MACOS":
        return '"macOS"';
      case "LINUX":
        return '"Linux"';
      case "ANDROID":
        return '"Android"';
      case "IOS":
        return '"iOS"';
      default:
        return '"Windows"';
    }
  }

  engineLauncher(engine: BrowserEngine): BrowserType {
    if (engine === "FIREFOX") return firefox;
    if (engine === "WEBKIT") return webkit;
    return chromium;
  }

  resolveOs(osName?: string): string[] {
    if (!osName) return ["windows", "macos", "linux"];
    const n = osName.toLowerCase();
    if (n.includes("windows")) return ["windows"];
    if (n.includes("mac") || n.includes("darwin")) return ["macos"];
    if (n.includes("android")) return ["android"];
    if (n.includes("ios")) return ["ios"];
    return ["linux"];
  }

  resolveBrowser(engine: BrowserEngine, browserName?: string): string[] {
    if (browserName) {
      const b = browserName.toLowerCase();
      if (b.includes("firefox")) return ["firefox"];
      if (b.includes("safari")) return ["safari"];
      if (b.includes("edge")) return ["edge"];
      return ["chrome"];
    }
    if (engine === "FIREFOX") return ["firefox"];
    if (engine === "WEBKIT") return ["safari"];
    return ["chrome"];
  }

  resolveBrowserEngine(browserName?: BrowserName): BrowserEngine {
    switch (browserName) {
      case "CHROME":
      case "CHROME_MOBILE":
      case "EDGE":
        return "CHROMIUM";
      case "FIREFOX":
      case "FIREFOX_MOBILE":
        return "FIREFOX";
      case "SAFARI":
      case "SAFARI_MOBILE":
        return "WEBKIT";
      default:
        return "CHROMIUM";
    }
  }

  private isMobileDeviceFromFingerprint(fingerprint: any): boolean {
    return (
      fingerprint?.navigator?.userAgent?.includes("Mobile") ||
      fingerprint?.navigator?.userAgent?.includes("Android") ||
      fingerprint?.navigator?.userAgent?.includes("iPhone")
    );
  }

  // ============================================================
  // Browser Behaviour Simulator
  // ============================================================

  async simulateBehaviour(
    page: Page,
    targetUrl: string,
    cfg: BrowserBehaviourConfig,
    referrer?: string,
    capabilities?: BrowserCapabilities,
  ): Promise<BrowserSimulateResult> {
    const events: BrowserSimulateEvent[] = [];
    const startMs = Date.now();
    let pagesVisited = 0;

    let targetOrigin = "http://localhost";
    try {
      targetOrigin = new URL(targetUrl).origin;
    } catch {
      // use fallback
    }

    await this.gotoInitialTarget(page, targetUrl, referrer);
    pagesVisited++;
    events.push("NAVIGATE");

    await this.waitForPageSettle(page);
    await sleep(rand(600, 1400));

    await this.moveMouseNatural(page);
    events.push("MOUSE_MOVE");

    const scrollSteps = rand(cfg.minScrollCount, cfg.maxScrollCount);
    await this.scrollPage(
      page,
      scrollSteps,
      cfg.scrollSpeedMin,
      cfg.scrollSpeedMax,
    );
    events.push("SCROLL");

    if (cfg.clickSelectors.length > 0) {
      for (const selector of cfg.clickSelectors) {
        const clicked = await this.tryClickSelector(page, selector);
        if (clicked) {
          events.push("CLICK");
          await sleep(rand(1200, 3000));
          await this.waitForPageSettle(page);

          if (page.url() !== targetUrl) {
            pagesVisited++;
            events.push("NAVIGATE");
            await sleep(rand(1500, 4000));
            await page
              .goBack({ timeout: 8000, waitUntil: "domcontentloaded" })
              .catch(() => {});
            events.push("BACK");
            await sleep(rand(600, 1200));
          }
          break;
        }
      }
    }

    const dwellDeadlineMs =
      startMs + rand(cfg.minDwellSeconds, cfg.maxDwellSeconds) * 1000;
    let internalClicks = 0;

    while (Date.now() < dwellDeadlineMs) {
      const remaining = dwellDeadlineMs - Date.now();
      if (remaining < 1000) break;

      await this.moveMouseNatural(page);
      await sleep(rand(1200, 3500));

      // Occasionally scroll more
      if (Math.random() < 0.4) {
        await this.scrollPage(
          page,
          rand(1, 3),
          cfg.scrollSpeedMin,
          cfg.scrollSpeedMax,
        );
      }

      // Internal navigation
      if (
        cfg.enableInternalNav &&
        internalClicks < cfg.maxInternalClicks &&
        Math.random() < 0.3
      ) {
        const links = await this.getInternalLinks(page, targetOrigin);
        const link = links[Math.floor(Math.random() * links.length)];
        if (link) {
          await page
            .goto(link, { waitUntil: "domcontentloaded", timeout: 15_000 })
            .catch(() => {});
          pagesVisited++;
          internalClicks++;
          events.push("INTERNAL_NAV");
          await this.waitForPageSettle(page);
          await this.scrollPage(
            page,
            rand(2, 5),
            cfg.scrollSpeedMin,
            cfg.scrollSpeedMax,
          );
          await sleep(rand(2000, 6000));
        }
      }
    }

    events.push("DWELL");

    return {
      pagesVisited,
      events,
      finalUrl: page.url(),
      durationMs: Date.now() - startMs,
    };
  }

  private async scrollPage(
    page: Page,
    steps: number,
    speedMin: number,
    speedMax: number,
  ): Promise<void> {
    for (let i = 0; i < steps; i++) {
      const amount = rand(80, 250);
      await page.evaluate(
        (y: number) => window.scrollBy({ top: y, behavior: "smooth" }),
        amount,
      );
      await sleep(rand(speedMin, speedMax));
    }
  }

  private async moveMouseNatural(page: Page): Promise<void> {
    const vp = page.viewportSize();
    const maxX = vp ? vp.width - 50 : 1200;
    const maxY = vp ? vp.height - 50 : 700;

    const x1 = rand(50, maxX);
    const y1 = rand(50, maxY);
    const x2 = rand(50, maxX);
    const y2 = rand(50, maxY);

    // Move in two steps for a more natural curve
    await page.mouse.move(x1, y1, { steps: rand(5, 15) }).catch(() => {});
    await sleep(rand(80, 200));
    await page.mouse.move(x2, y2, { steps: rand(5, 15) }).catch(() => {});
  }

  private normalizeClickSelector(input: BrowserClickSelector): {
    selector: string;
    selectorType: string;
  } {
    if (typeof input === "string")
      return { selector: input, selectorType: "css" };
    return {
      selector: input.selector,
      selectorType: input.selectorType ?? "css",
    };
  }

  private async tryClickSelector(
    page: Page,
    input: BrowserClickSelector,
  ): Promise<boolean> {
    try {
      const { selector, selectorType } = this.normalizeClickSelector(input);
      const query = selectorType === "xpath" ? `xpath=${selector}` : selector;
      const handle =
        selectorType === "elementId"
          ? await page.evaluateHandle(
              (id) => document.getElementById(id),
              selector,
            )
          : null;
      const el = handle?.asElement() ?? (await page.$(query));
      if (!el) return false;
      const visible = await el.isVisible().catch(() => false);
      if (!visible) return false;
      await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      await sleep(rand(100, 300));
      await el.click({ delay: rand(40, 180), timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private async getInternalLinks(
    page: Page,
    targetOrigin: string,
  ): Promise<string[]> {
    try {
      return await page.evaluate((origin: string) => {
        const anchors = Array.from(
          document.querySelectorAll("a[href]"),
        ) as HTMLAnchorElement[];
        return anchors
          .map((a) => a.href)
          .filter(
            (href) =>
              href.startsWith(origin) &&
              !href.includes("#") &&
              !href.endsWith(".pdf"),
          )
          .slice(0, 30);
      }, targetOrigin);
    } catch {
      return [];
    }
  }

  private async waitForPageSettle(page: Page): Promise<void> {
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(async () => {
        await sleep(rand(500, 1200));
      });
  }

  private async gotoInitialTarget(
    page: Page,
    targetUrl: string,
    referrer?: string,
  ): Promise<void> {
    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
        ...(referrer ? { referer: referrer } : {}),
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout =
        message.includes("Timeout") || message.includes("timeout");
      const currentUrl = page.url();

      if (isTimeout && currentUrl && currentUrl !== "about:blank") {
        return;
      }

      throw error;
    }
  }

  // ============================================================
  // PROXY Builder
  // ============================================================
  private async runBrowserIpChecks(page: Page): Promise<ProxyIpCheck[]> {
    const checks: ProxyIpCheck[] = [];
    const urls = ["https://httpbin.org/ip", "https://api.ipify.org?format=json"];

    for (const url of urls) {
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: this.options.navigationTimeout ?? 60_000,
        });
        checks.push({
          url,
          status: response?.status() ?? null,
          body: (await page.textContent("body").catch(() => null))?.trim() ?? null,
        });
      } catch (error) {
        checks.push({
          url,
          status: null,
          body: error instanceof Error ? error.message : "IP check failed",
        });
      }
    }

    return checks;
  }

  private requestViaProxy(url: string, proxyUrl: string): Promise<ProxyIpCheck> {
    return new Promise((resolve) => {
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        resolve({
          url,
          status: null,
          body: "Invalid target URL",
        });
        return;
      }

      const isHttps = target.protocol === "https:";
      const transport = isHttps ? https : http;
      const agent = isHttps
        ? new HttpsProxyAgent(proxyUrl)
        : new HttpProxyAgent(proxyUrl);

      const req = transport.get(
        url,
        {
          agent,
          timeout: this.options.navigationTimeout ?? 60_000,
          headers: {
            accept: "application/json,text/plain,*/*",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            resolve({
              url,
              status: res.statusCode ?? null,
              body: Buffer.concat(chunks).toString("utf8").trim(),
            });
          });
        },
      );

      req.on("timeout", () => {
        req.destroy(new Error("Request timeout"));
      });
      req.on("error", (error) => {
        resolve({
          url,
          status: null,
          body: error.message,
        });
      });
    });
  }

  private buildReferrer(
    targetUrl: string,
    source?: BrowserTrafficSourceInput,
    customReferrer?: string | null,
  ): string | null {
    switch (source) {
      case "SEARCH": {
        try {
          const hostname = new URL(targetUrl).hostname;
          return `https://www.google.com/search?q=${encodeURIComponent(hostname)}`;
        } catch {
          return "https://www.google.com/";
        }
      }
      case "SOCIAL":
        return this.pickRandomOr(
          [
            "https://www.facebook.com/",
            "https://x.com/",
            "https://www.instagram.com/",
            "https://www.youtube.com/",
            "https://www.linkedin.com/",
            "https://www.tiktok.com/",
            "https://www.pinterest.com/",
            "https://www.reddit.com/",
          ],
          "https://www.facebook.com/",
        );
      case "REFERRAL":
        return customReferrer ?? null;
      case "DIRECT":
        return null;
      default:
        return null;
    }
  }

  private normalizeGatewayHost() {
    const rawHost = String(this.options.gwHost || "").trim();
    const withScheme = /^https?:\/\//i.test(rawHost)
      ? rawHost
      : `http://${rawHost}`;
    const url = new URL(withScheme);

    url.protocol = "http:";
    url.username = "";
    url.password = "";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    url.port = String(this.options.gwPort || url.port || 10000);

    return url;
  }

  private buildGatewayProxy(proxy: ProxyPool): BuiltGatewayProxy {
    const serverUrl = this.normalizeGatewayHost();
    const authUrl = new URL(serverUrl.toString());

    authUrl.username = proxy.gatewayUsername;
    authUrl.password = proxy.gatewayPassword;

    return {
      server: serverUrl.origin,
      username: proxy.gatewayUsername,
      password: proxy.gatewayPassword,
      bypass: "<-loopback>",
      url: authUrl.toString(),
    };
  }

  private normalizeProxy(proxy?: ProxyPool) {
    let proxyPlaywright: PlaywrightProxy | undefined;

    try {
      const server = `${this.options.gwHost}:${this.options.gwPort}`;
      const u = new URL(server);
      if (u.username || u.password) {
        const username =
          proxy?.gatewayUsername ?? decodeURIComponent(u.username);
        const password =
          proxy?.gatewayPassword ?? decodeURIComponent(u.password);
        u.username = "";
        u.password = "";

        proxyPlaywright = {
          server: u.origin, // http://host:port (tanpa kredensial)
          username,
          password,
          bypass: "<-loopback>",
        };
      }
    } catch {
      /* server bukan URL valid — pakai apa adanya */
    }
    return {
      ...proxyPlaywright,
      bypass: "<-loopback>",
    };
  }

  private pickRandomOr<T>(arr: T[], fallback: T): T {
    return arr.length === 0
      ? fallback
      : (arr[Math.floor(Math.random() * arr.length)] as T);
  }

  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.activeSessions.values()).map((s) =>
      s.close(),
    );
    await Promise.all(closePromises);
  }
}
