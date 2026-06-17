import type { NavigationMenuItem } from "@nuxt/ui";
import type { Browser, BrowserContext } from "playwright";
import type { ProxyPool } from "@prisma/client";

declare global {
  interface Window {
    dataLayer: any[];
    fbq: any;
    ttq: any;
    ethereum?: {
      isMetaMask?: true;
      request: (...args: any[]) => Promise<void>;
      on: (eventName: string, callback: (...args: any[]) => void) => void;
      removeListener: (
        eventName: string,
        callback: (...args: any[]) => void,
      ) => void;
    };
  }
  interface ApiMeta {
    total: number;
    page: number;
    limit: number;
    offset: number;
    totalPages: number;
    has_more: boolean;
  }

  interface ApiError {
    code: string;
    message?: string;
    redirect_url?: string;
    details?: any;
    fieldErrors?: Record<string, string[]>;
    retryable?: boolean;
    timestamp?: string;
  }

  interface ApiResponse<T = any, M extends Record<string, any> = ApiMeta> {
    status: number;
    success: boolean;
    message: string;
    data?: T | null;
    error?: ApiError;
    meta?: M;
    headers?: Record<string, string>;
  }

  type FieldErrors = Record<string, string[]>;

  interface ApiErrorOptions {
    code: string;
    message?: string;
    statusCode?: number;
    redirectUrl?: string;
    details?: any;
    fieldErrors?: FieldErrors;
    retryable?: boolean;
  }

  type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  // ============================================================
  // MODEL TYPES
  // ============================================================
  type Permission =
    | "create_campaign"
    | "delete_campaign"
    | "manage_users"
    | "restart_worker"
    | "system_settings"
    | "billing_access"
    | "view_analytics"
    | "manage_proxies"
    | "view_admin_dashboard"
    | "manage_integrations";

  type UserRole = "user" | "admin" | "superadmin";
  const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    user: [
      "create_campaign",
      "delete_campaign",
      "billing_access",
      "view_analytics",
      "manage_proxies",
      "manage_integrations",
    ],
    moderator: [
      "create_campaign",
      "delete_campaign",
      "manage_users",
      "restart_worker",
      "view_analytics",
      "manage_proxies",
      "view_admin_dashboard",
    ],
    admin: [
      "create_campaign",
      "delete_campaign",
      "manage_users",
      "restart_worker",
      "system_settings",
      "billing_access",
      "view_analytics",
      "manage_proxies",
      "view_admin_dashboard",
      "manage_integrations",
    ],
    superadmin: [
      "create_campaign",
      "delete_campaign",
      "manage_users",
      "restart_worker",
      "system_settings",
      "billing_access",
      "view_analytics",
      "manage_proxies",
      "view_admin_dashboard",
      "manage_integrations",
    ],
  };
  const ROLE_LEVEL: Record<UserRole, number> = {
    user: 3,
    moderator: 2,
    admin: 1,
    superadmin: 0,
  };
  const hasPermission = (role: UserRole, perm: Permission) =>
    ROLE_PERMISSIONS[role]?.includes(perm) ?? false;

  const hasMinRole = (role: UserRole, min: UserRole) =>
    ROLE_LEVEL[role] >= ROLE_LEVEL[min];

  interface SettingResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
  }
  type SettingRow = Pick<SettingConfig, "key" | "value"> & {
    updated_at?: Date;
  };
  interface SettingConfig {
    site_name: string;
    site_description: string;
    site_keywords: string;
    site_icon: string;
    site_logo: string;
    site_favicon: string;
    site_theme: string;
    is_maintenance: boolean;
    enable_register: boolean;
    enable_github_provider: boolean;
    enable_google_provider: boolean;
    max_upload_size_mb: number;
    max_upload_image_mb: number;
    max_upload_video_mb: number;
    max_upload_audio_mb: number;
    max_upload_document_mb: number;
    max_upload_code_mb: number;
    max_upload_archive_mb: number;
  }

  type PublicSettings = {
    site_name: string;
    site_description: string;
    site_keywords: string;
    site_icon: string;
    site_logo: string;
    site_favicon: string;
    site_theme: string;
    is_maintenance: boolean;
    enable_register: boolean;
    enable_github_provider: boolean;
    enable_google_provider: boolean;
    max_upload_size_mb: number;
    max_upload_image_mb: number;
    max_upload_video_mb: number;
    max_upload_audio_mb: number;
    max_upload_document_mb: number;
    max_upload_code_mb: number;
    max_upload_archive_mb: number;
  };

  type SettingsGroupMap = Record<string, Record<string, string>>;

  // ============================================================
  // WEBSOCKET TYPES
  // ============================================================
  type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
  interface QueueRealtimeStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }
  interface QueueRealtimeEvent {
    queue: QueueName;
    status:
      | "waiting"
      | "active"
      | "completed"
      | "failed"
      | "delayed"
      | "paused";
    size: number;
    stats: QueueRealtimeStats;
    jobId?: string;
    campaignId?: string;
    sessionId?: string;
    proxyId?: string;
    reason?:
      | "scheduled"
      | "blocked"
      | "error"
      | "country_mismatch"
      | "auth_fail"
      | "interval";
    sourceQueue?:
      | "campaign_queue"
      | "session_queue"
      | "analytics_queue"
      | "proxy_rotation_queue"
      | "retry_queue";
    workerId?: string;
    error?: string;
    timestamp: number;
  }
  interface RealtimeState {
    connected: boolean;
    activeSessions: number;
    onlineWorkers: number;
    queueSize: number;
    campaignStats: Record<string, any>;
    workerStats: Record<string, any>[];
    proxyHealth: Record<string, any>[];
    queueStats: Partial<Record<QueueName, QueueRealtimeStats>>;
    queueEvents: QueueRealtimeEvent[];
  }

  // ============================================================
  // DTO INPUT TYPES
  // ============================================================
  interface UploadResult {
    url: string;
    public_id: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
  }
  interface PostgresRangeDate {
    start: string;
    end: string;
  }

  type AllowedMimeType =
    // Image
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp"
    | "image/svg+xml"
    // Video
    | "video/mp4"
    | "video/webm"
    | "video/quicktime"
    // Audio
    | "audio/mpeg"
    | "audio/wav"
    | "audio/ogg"
    // Document
    | "application/pdf"
    | "application/msword"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "text/plain"
    | "text/markdown"
    // Code
    | "text/html"
    | "text/css"
    | "text/javascript"
    | "application/json"
    | "application/yaml"
    | "text/x-python"
    | "text/x-typescript";

  type MediaType =
    | "IMAGE"
    | "VIDEO"
    | "AUDIO"
    | "DOCUMENT"
    | "CODE"
    | "ARCHIVE"
    | "OTHER";

  type ColorVariant =
    | "indigo"
    | "emerald"
    | "amber"
    | "red"
    | "blue"
    | "purple"
    | "neutral";

  interface CountryItem {
    name: string;
    code: string;
    emoji: string;
    unicode: string;
    image: string;
    dial_code: string;
    minLength?: number;
    maxLength?: number;
  }

  interface SimplelocalizeCountryItem {
    locale: string;
    language: {
      name: string;
      name_local: string;
      iso_639_1: string;
      iso_639_2: string;
      iso_639_3: string;
      countries: {
        name: string;
        name_local: string;
        code: string;
      }[];
    };
    country: {
      name: string;
      name_local: string;
      code: string;
      area_sq_km: number;
      region: string;
      capital_name: string;
      capital_latitude: number;
      capital_longitude: number;
      currency: string;
      currency_local: string;
      currency_code: string;
      currency_symbol: string;
      currency_numeric: number;
      currency_subunit_value: number;
      currency_subunit_name: string;
      languages: {
        name: string;
        name_local: string;
        iso_639_1: string;
        iso_639_2: string;
        iso_639_3: string;
      }[];
      flag: string;
      timezones: string[];
      borders: string[];
      is_landlocked: boolean;
      postal_code_format: string;
      postal_code_regex: string;
      iso_3166_1_numeric: number;
      iso_3166_1_alpha2: string;
      iso_3166_1_alpha3: string;
      tld: string;
      vehicle_code: string;
      fips10: string;
      un_locode: string;
      stanag_1059: string;
      ioc: string;
      uic: string;
      fifa: string;
      maritime: number;
      mmc: number;
      itu: string;
    };
  }

  interface AppNavigationMenuItem extends NavigationMenuItem {
    requireAdmin: boolean;
  }

  // ============================================================
  // UTILITIES TYPES
  // ============================================================
  interface PayPalWebhookResource {
    id: string;
    custom_id?: string;
    purchase_units?: Array<{
      custom_id?: string;
      reference_id?: string;
      amount?: {
        currency_code: string;
        value: string;
      };
      payee?: {
        email_address?: string;
        merchant_id?: string;
      };
    }>;
    payer?: {
      email_address?: string;
      payer_id?: string;
      name?: {
        given_name?: string;
        surname?: string;
      };
    };
    status?: string;
    create_time?: string;
    update_time?: string;
    [key: string]: unknown;
  }
  interface ProxyScrapeItem {
    ip?: string;
    port?: number;
    protocol?: string; // http | socks4 | socks5
    ssl?: boolean;
    anonymity?: string;
    ip_data?: { countryCode?: string };
  }
  interface ProxyDailiyItem {
    anonymity?: unknown;
    country?: unknown;
    ip?: unknown;
    port?: unknown;
    protocol?: unknown;
    speed?: unknown;
  }
  interface SunnyProxyItem {
    ip?: unknown;
    port?: unknown;
    country?: unknown;
    type?: unknown;
    anonymity?: unknown;
  }
  interface ProxyGenodeItem {
    _id?: string;
    ip?: string;
    anonymityLevel?: string;
    asn?: string;
    city?: string;
    country?: string;
    created_at?: string;
    google?: boolean;
    isp?: string;
    lastChecked?: number;
    latency?: number;
    org?: string;
    port?: string;
    protocols?: string[];
    speed?: number;
    upTime?: number;
    upTimeSuccessCount?: number;
    upTimeTryCount?: number;
    updated_at?: string;
    responseTime?: number;
  }
  // ============================================================
  // PLAYWRIGHT TESTER TYPES
  // ============================================================

  type BrowserEngine = "CHROMIUM" | "FIREFOX" | "WEBKIT";
  type DeviceType = "DESKTOP" | "MOBILE";
  type OSName = "WINDOWS" | "LINUX" | "MACOS" | "ANDROID" | "IOS";
  type BrowserName =
    | "CHROME"
    | "FIREFOX"
    | "SAFARI"
    | "EDGE"
    | "CHROME_MOBILE"
    | "SAFARI_MOBILE"
    | "FIREFOX_MOBILE";
  type BrowserProxyStrategy = "NONE" | "PER_SESSION" | "ROTATE";

  interface BrowserCapabilities {
    supportsWheel: boolean;
    isMobile: boolean;
    isWebKit: boolean;
    isFirefox: boolean;
    isChromium: boolean;
  }

  interface FingerprintHint {
    name: string;
    slug: string;
    deviceType?: DeviceType;
    osName?: string;
    osVersion?: string | null;
    browserName?: string;
    browserVersion?: string | null;
    userAgent?: string | null;
    language?: string;
    timezone?: string;
    locale?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    canvasMode?: string;
    canvasSeed?: number | null;
    webglVendor?: string | null;
    webglRenderer?: string | null;
    hardwareConcurrency?: number | null;
    deviceMemory?: number | null;
    extraConfig?: Record<string, any> | null;
  }

  interface SessionBrowser {
    browser: Browser;
    context: BrowserContext;
    /** Detected timezone used in this session */
    timezone: string;
    /** UA used in this session */
    userAgent: string;
    /** Additional for crawlee pool */
    isMobile?: boolean;
    capabilities?: {
      supportsWheel: boolean;
      isMobile: boolean;
      isWebKit: boolean;
    };
    close: () => Promise<void>;
  }

  export interface PlaywrightProxy {
    server: string;
    username?: string;
    password?: string;
    bypass?: string;
  }

  interface BrowserBehaviourConfig {
    name: string;
    slug: string;
    minDwellSeconds: number;
    maxDwellSeconds: number;
    minScrollCount: number;
    maxScrollCount: number;
    /** milliseconds between scroll steps */
    scrollSpeedMin: number;
    scrollSpeedMax: number;
    enableInternalNav: boolean;
    maxInternalClicks: number;
    /** CSS, XPath, or element id selectors to attempt clicking */
    clickSelectors: BrowserClickSelector[];
    // Additional
    clickProbability?: number;
    mouseMoveProbability?: number;
    typingSpeedMin?: number;
    typingSpeedMax?: number;
  }

  type BrowserClickSelectorType = "css" | "xpath" | "elementId";

  type BrowserClickSelector =
    | string
    | {
        selector: string;
        selectorType?: BrowserClickSelectorType | string;
      };

  interface BrowserSimulateResult {
    pagesVisited: number;
    events: BrowserSimulateEvent[];
    finalUrl: string;
    durationMs: number;
  }

  type BrowserSimulateEvent =
    | "NAVIGATE"
    | "SCROLL"
    | "CLICK"
    | "BACK"
    | "INTERNAL_NAV"
    | "MOUSE_MOVE"
    | "DWELL";
}
