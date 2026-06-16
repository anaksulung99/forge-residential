import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;
const enablePrerender = process.env.NUXT_ENABLE_PRERENDER === "true";
const configuredSiteUrl = process.env.NUXT_PUBLIC_SITE_URL?.trim();
const isLocalSiteUrl = configuredSiteUrl
  ? /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(
      configuredSiteUrl,
    )
  : false;
const publicSiteUrl =
  configuredSiteUrl && !isLocalSiteUrl
    ? configuredSiteUrl
    : "https://localtunnel.it.com";

export default defineNuxtConfig({
  modules: [
    "@nuxt/eslint",
    "@nuxt/ui",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxtjs/i18n",
    "@nuxtjs/sanity",
    "@nuxtjs/sitemap",
    "@nuxtjs/robots",
    "@pinia/nuxt",
    "@vee-validate/nuxt",
    "@vueuse/nuxt",
    "nuxt-headlessui",
    "nuxt-auth-utils",
    "nuxt-charts",
  ],
  devtools: {
    enabled: false,
  },
  experimental: {
    payloadExtraction: true,
  },
  css: ["~/assets/css/main.css", "vue3-flag-icons/styles"],
  compatibilityDate: "2025-01-15",
  eslint: {
    config: {
      stylistic: {
        commaDangle: "never",
        braceStyle: "1tbs",
      },
    },
  },
  vite: {
    build: {
      sourcemap: isProd,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          sourcemapExcludeSources: true,
          manualChunks: (id) => {
            if (id.includes("node_modules")) {
              if (id.includes("lodash")) return "vendor-lodash";
              return "vendor";
            }
            if (id.includes("assets/css")) {
              return "styles";
            }
          },
        },
        plugins: [],
        external: ["sharp"],
      },
      chunkSizeWarningLimit: 2000,
    },
    css: {
      preprocessorMaxWorkers: true,
      devSourcemap: false,
    },
    plugins: [
      {
        apply: "build",
        name: "vite-plugin-ignore-sourcemap-warnings",
        configResolved(config) {
          const originalOnWarn = config.build.rollupOptions.onwarn;
          config.build.rollupOptions.onwarn = (warning, warn) => {
            if (
              warning.code === "SOURCEMAP_BROKEN" &&
              warning.plugin === "@tailwindcss/vite:generate:build"
            ) {
              return;
            }

            if (originalOnWarn) {
              originalOnWarn(warning, warn);
            } else {
              warn(warning);
            }
          };
        },
      },
    ],
    server: {
      ...(isDev ? { hmr: { port: 24679 } } : {}),
      allowedHosts: true,
      // Jangan pre-transform semua dep saat startup — hemat memory dev
      preTransformRequests: false,
    },
    resolve: {
      alias: [],
    },
    define: {
      global: "globalThis",
    },
    vue: {
      script: {
        globalTypeFiles: [
          fileURLToPath(new URL("./shared/types/index.d.ts", import.meta.url)),
        ],
      },
    },
    optimizeDeps: {
      include: [
        "date-fns",
        "clsx",
        "vee-validate",
        "@vee-validate/zod",
        "zod",
        "mitt",
        "pinia",
        "vue",
        "@vueuse/core",
        "vue3-toastify",
        "@morev/vue-transitions",
      ],
      exclude: ["@prisma/client", "@prisma/adapter-pg"],
      holdUntilCrawlEnd: false,
    },
  },
  nitro: {
    compressPublicAssets: isProd
      ? {
          gzip: true,
          brotli: true,
        }
      : true,
    experimental: {
      websocket: true,
      wasm: false,
    },
    ...(enablePrerender
      ? {
          prerender: {
            crawlLinks: false,
            failOnError: false,
            ignore: ["/app/**", "/__sitemap__/style.xsl"],
            routes: ["/robots.txt"],
          },
        }
      : {}),
    minify: isProd,
    ...(isDev && {
      devHandlers: [],
      devProxy: {
        // Proxy config jika perlu
      },
    }),
    ...(isProd && {
      timing: false, // Disable timing headers di prod
    }),
  },
  hooks: {
    "vite:extendConfig": (config) => {
      // if (typeof config.server!.hmr === "object") {
      // 	config.server!.hmr.protocol = "wss";
      // }
    },
  },
  routeRules: {
    "/": { prerender: false },
    "/sitemap.xml": {
      isr: 3600,
      headers: {
        "Content-Type": "application/xml",
      },
    },
    "/_robots.txt": {
      static: true,
    },
    "/.well-known/**": {
      static: true,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=604800",
      },
    },
    "/_nuxt/**": isProd
      ? {
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        }
      : {
          headers: {
            "Cache-Control": "no-store",
          },
        },
    "/api/**": {
      cors: true,
      cache: false,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      },
    },
  },
  site: {
    url: publicSiteUrl,
    name: process.env.APP_NAME || "Forge Residential Proxy",
    indexable: true,
  },
  robots: {
    debug: false,
    disallow: ["/app"],
    allow: "/",
  },
  sitemap: {
    sitemapsPathPrefix: "/",
    sitemaps: {
      pages: {
        includeAppSources: true,
        exclude: ["/app/**"],
      },
    },
    exclude: ["/app/**"],
    defaults: {
      changefreq: "daily",
      priority: 0.7,
      lastmod: new Date().toISOString(),
    },
  },
  $development: {
    scripts: {
      registry: {
        googleTagManager: "mock",
        id: "G-B7R83XWFT7",
      },
    },
  },
  app: {
    baseURL: "/",
    buildAssetsDir: "/_nuxt/",
    cdnURL: isDev ? "" : undefined,
    head: {
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      meta: [
        { name: "format-detection", content: "telephone=no" },
        { name: "robots", content: "index,follow" },
      ],
      link: [
        {
          rel: "icon",
          type: "image/png",
          href: "/favicon-96x96.png",
          sizes: "96x96",
        },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/favicon.svg",
        },
        {
          rel: "shortcut",
          type: "image/png",
          href: "/favicon.ico",
          sizes: "96x96",
        },
        {
          rel: "apple-touch-icon",
          type: "image/png",
          href: "/apple-touch-icon.png",
          sizes: "180x180",
        },
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap",
          crossorigin: "",
        },
      ],
      bodyAttrs: {},
    },
    pageTransition: { name: "page", mode: "out-in" },
  },
  colorMode: {
    preference: "dark",
    classSuffix: "",
    storage: "cookie",
    storageKey: "forge-color-mode",
    dataValue: "theme",
  },
  typescript: {
    shim: false,
    strict: true,
    typeCheck: false, // Matikan type check saat dev — jalankan manual via `pnpm typecheck`
  },
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
    fetchTimeout: 2000,
    serverBundle: "local",
  },
  image: {
    quality: 80,
    format: ["avif", "webp", "jpeg", "jpg", "png", "gif"],
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
      "2xl": 1536,
    },
  },
  i18n: {
    baseUrl: publicSiteUrl,
    strategy: "prefix_except_default",
    defaultLocale: "en",
    langDir: "locales",
    locales: [
      {
        code: "en",
        name: "English",
        file: "en.json",
      },
      {
        code: "id",
        name: "Bahasa Indonesia",
        file: "id.json",
      },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_redirected",
      redirectOn: "root",
    },
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    token: process.env.SANITY_TOKEN,
  },
  runtimeConfig: {
    AppName: process.env.APP_NAME,
    AppVersion: process.env.APP_VERSION,
    NodeEnv: process.env.NODE_ENV,
    PublicSiteUrl: process.env.NUXT_PUBLIC_SITE_URL,
    AppSecret: process.env.APP_SECRET,
    GithubClientId: process.env.GITHUB_CLIENT_ID?.trim(),
    GithubClientSecret: process.env.GITHUB_CLIENT_SECRET?.trim(),
    GoogleClientId: process.env.GOOGLE_CLIENT_ID?.trim(),
    GoogleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
    oauth: {
      github: {
        clientId: (
          process.env.NUXT_OAUTH_GITHUB_CLIENT_ID ??
          process.env.GITHUB_CLIENT_ID
        )?.trim(),
        clientSecret: (
          process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET ??
          process.env.GITHUB_CLIENT_SECRET
        )?.trim(),
      },
      google: {
        clientId: (
          process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID ??
          process.env.GOOGLE_CLIENT_ID
        )?.trim(),
        clientSecret: (
          process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET ??
          process.env.GOOGLE_CLIENT_SECRET
        )?.trim(),
      },
    },
    session: {
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    },
    sanity: {
      token: process.env.NUXT_SANITY_TOKEN,
    },
    CloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
    CloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
    CloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
    CloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
    RedisHost: process.env.REDIS_HOST,
    RedisPort: process.env.REDIS_PORT,
    RedisUser: process.env.REDIS_USER,
    RedisPassword: process.env.REDIS_PASSWORD,
    RedisDb: process.env.REDIS_DB,
    RedisTlsServername: process.env.REDIS_TLS_SERVERNAME,
    RedisUrl: process.env.REDIS_URL,
    RedisRootCa: process.env.REDIS_ROOT_CA,
    RedisCert: process.env.REDIS_CERT,
    RedisKey: process.env.REDIS_KEY,
    RedisEnforceNoEviction: process.env.REDIS_ENFORCE_NOEVICTION,
    RedisMaxMemoryPolicy: process.env.REDIS_MAXMEMORY_POLICY,
    BullmqUrl: process.env.BULLMQ_URL,
    NodeMailerHost: process.env.NODEMAILER_HOST,
    NodeMailerPort: process.env.NODEMAILER_PORT,
    NodeMailerSecure: process.env.NODEMAILER_SECURE,
    NodeMailerAuthUser: process.env.NODEMAILER_AUTH_USER,
    NodeMailerAuthPass: process.env.NODEMAILER_AUTH_PASS,
    NodeMailerAuthPassword: process.env.NODEMAILER_AUTH_PASSWORD,
    NodeMailerFrom: process.env.NODEMAILER_FROM,
    AdminEmail: process.env.ADMIN_EMAIL,
    AdminPassword: process.env.ADMIN_PASSWORD,
    AdminName: process.env.ADMIN_NAME,
    SalesEmail: process.env.SALES_EMAIL,
    SupportEmail: process.env.SUPPORT_EMAIL,
    NuxtSessionPassword: process.env.NUXT_SESSION_PASSWORD,
    AppClientSecret: process.env.APP_CLIENT_SECRET,
    SanityProjectId: process.env.SANITY_PROJECT_ID,
    SanityDataset: process.env.SANITY_DATASET,
    NuxtSanityToken: process.env.NUXT_SANITY_TOKEN,
    JWTAccessSecret: process.env.JWT_ACCESS_SECRET,
    JWTRefreshSecret: process.env.JWT_REFRESH_SECRET,
    MidtransMerchantId: process.env.MIDTRANS_MERCHANT_ID,
    MidtransClientKey: process.env.MIDTRANS_CLIENT_KEY,
    MidtransServerKey: process.env.MIDTRANS_SERVER_KEY,
    MidtransIsProduction: process.env.MIDTRANS_IS_PRODUCTION,
    XenditSecretKey: process.env.XENDIT_SECRET_KEY,
    XenditPublicKey: process.env.XENDIT_PUBLIC_KEY,
    XenditWebhookToken: process.env.XENDIT_WEBHOOK_TOKEN,
    PaypalClientId: process.env.PAYPAL_CLIENT_ID,
    PaypalClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    PaypalWebhookId: process.env.PAYPAL_WEBHOOK_ID,
    PaypalMode: process.env.PAYPAL_MODE,
    ExchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY,

    public: {
      AppName: process.env.APP_NAME,
      AppVersion: process.env.APP_VERSION,
      NodeEnv: process.env.NODE_ENV,
      PublicSiteUrl: process.env.NUXT_PUBLIC_SITE_URL,
      SalesEmail: process.env.SALES_EMAIL,
      SupportEmail: process.env.SUPPORT_EMAIL,
      GatewayHost: process.env.GATEWAY_PUBLIC_HOST || "localhost",
      GatewayPort: process.env.GATEWAY_PORT || "10000",
      GithubClientId: process.env.GITHUB_CLIENT_ID?.trim(),
      GoogleClientId: process.env.GOOGLE_CLIENT_ID?.trim(),
      oauth: {
        github: {
          clientId: (
            process.env.NUXT_OAUTH_GITHUB_CLIENT_ID ??
            process.env.GITHUB_CLIENT_ID
          )?.trim(),
        },
        google: {
          clientId: (
            process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID ??
            process.env.GOOGLE_CLIENT_ID
          )?.trim(),
        },
      },
      sanity: {
        token: process.env.NUXT_SANITY_TOKEN,
      },
      AppClientSecret: process.env.APP_CLIENT_SECRET,
      SanityProjectId: process.env.SANITY_PROJECT_ID,
    },
  },
  build: {
    transpile: isProd ? [] : [],
  },
});
