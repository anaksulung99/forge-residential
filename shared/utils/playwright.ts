export const DEVICE_OS_MAP: Record<DeviceType, OSName[]> = {
  DESKTOP: ["WINDOWS", "LINUX", "MACOS"],
  MOBILE: ["ANDROID", "IOS"],
};

export const OS_VERSION_MAP: Record<OSName, string[]> = {
  WINDOWS: ["11", "10"],
  LINUX: ["Ubuntu 24.04", "Ubuntu 22.04", "Fedora 40", "Debian 12"],
  MACOS: ["15", "14", "13"],
  ANDROID: ["15", "14", "13", "12"],
  IOS: ["18", "17", "16"],
};

export const OS_BROWSER_COMPAT: Record<OSName, BrowserName[]> = {
  WINDOWS: ["CHROME", "FIREFOX", "EDGE"],
  LINUX: ["CHROME", "FIREFOX"],
  MACOS: ["CHROME", "FIREFOX", "SAFARI", "EDGE"],
  ANDROID: ["CHROME_MOBILE", "FIREFOX_MOBILE"],
  IOS: ["SAFARI_MOBILE", "CHROME_MOBILE"],
};

export const BROWSER_VERSION_MAP: Record<BrowserName, string[]> = {
  CHROME: ["132", "131", "130", "129", "128", "127", "126", "124", "120"],
  FIREFOX: ["134", "133", "131", "128", "125", "121", "120"],
  SAFARI: ["18.3", "18.2", "18.1", "18.0", "17.6", "17.5", "17.4"],
  EDGE: ["132", "131", "130", "129", "128", "127", "124", "120"],
  CHROME_MOBILE: ["132", "131", "130", "128", "126", "124", "120"],
  SAFARI_MOBILE: ["18.3", "18.2", "18.1", "18.0", "17.6", "17.5"],
  FIREFOX_MOBILE: ["134", "133", "131", "128", "125", "121"],
};

export const OS_LABELS: Record<OSName, string> = {
  WINDOWS: "Windows",
  LINUX: "Linux",
  MACOS: "macOS",
  ANDROID: "Android",
  IOS: "iOS",
};

export const BROWSER_LABELS: Record<BrowserName, string> = {
  CHROME: "Google Chrome",
  FIREFOX: "Mozilla Firefox",
  SAFARI: "Safari (macOS)",
  EDGE: "Microsoft Edge",
  CHROME_MOBILE: "Chrome Mobile",
  SAFARI_MOBILE: "Safari Mobile",
  FIREFOX_MOBILE: "Firefox Mobile",
};

export const ENGINE_MAP: Record<BrowserName, BrowserEngine> = {
  CHROME: "CHROMIUM",
  FIREFOX: "FIREFOX",
  SAFARI: "WEBKIT",
  EDGE: "CHROMIUM",
  CHROME_MOBILE: "CHROMIUM",
  SAFARI_MOBILE: "WEBKIT",
  FIREFOX_MOBILE: "FIREFOX",
};

export const VIEWPORT_PRESETS: Record<string, [number, number, number]> = {
  DESKTOP_WINDOWS: [1920, 1080, 1],
  DESKTOP_LINUX: [1920, 1080, 1],
  DESKTOP_MACOS: [2560, 1600, 2],
  MOBILE_ANDROID: [412, 915, 2.625],
  MOBILE_IOS: [390, 844, 3],
};

export const WEBGL_PRESETS: Record<
  string,
  { vendor: string; renderer: string }
> = {
  CHROME_WINDOWS: {
    vendor: "Google Inc. (NVIDIA)",
    renderer:
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  CHROME_LINUX: {
    vendor: "Google Inc. (Mesa)",
    renderer: "ANGLE (Mesa, AMD Radeon RX 580, OpenGL 4.6)",
  },
  CHROME_MACOS: { vendor: "Apple Inc.", renderer: "Apple M2" },
  CHROME_MOBILE_ANDROID: {
    vendor: "Qualcomm",
    renderer: "Adreno (TM) 740",
  },
  SAFARI_MOBILE_IOS: { vendor: "Apple Inc.", renderer: "Apple A16 GPU" },
  FIREFOX_WINDOWS: {
    vendor: "NVIDIA Corporation",
    renderer: "GeForce RTX 3060/PCIe/SSE2",
  },
  FIREFOX_LINUX: {
    vendor: "Mesa/X.org",
    renderer: "AMD Radeon RX 580 (POLARIS10, DRM 3.42.0)",
  },
  FIREFOX_MACOS: { vendor: "Apple Inc.", renderer: "Apple M2" },
  SAFARI_MACOS: { vendor: "Apple Inc.", renderer: "Apple M2" },
  EDGE_WINDOWS: {
    vendor: "Google Inc. (NVIDIA)",
    renderer:
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
};

export const FINGERPRINT_PROFILE: FingerprintHint[] = [
  {
    name: "Iphone IOS Safari",
    slug: "iphone-ios-safari",
    deviceType: "MOBILE",
    osName: "IOS",
    osVersion: "18.3",
    browserName: "SAFARI_MOBILE",
    browserVersion: "18.3",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/605.1.15",
    language: "en-US",
    timezone: "America/Chicago",
    locale: "en-US",
    viewportWidth: 390,
    viewportHeight: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    canvasMode: "none",
    canvasSeed: null,
    webglVendor: "Apple Inc.",
    webglRenderer: "Apple A16 GPU",
    hardwareConcurrency: 4,
    deviceMemory: 4,
    extraConfig: null,
  },
  {
    name: "Android Webview",
    slug: "android-webview",
    deviceType: "MOBILE",
    osName: "ANDROID",
    osVersion: "15",
    browserName: "CHROME_MOBILE",
    browserVersion: "132",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    language: "en-US",
    timezone: "America/Chicago",
    locale: "en-US",
    viewportWidth: 412,
    viewportHeight: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    canvasMode: "none",
    canvasSeed: null,
    webglVendor: "Qualcomm",
    webglRenderer: "Adreno (TM) 740",
    hardwareConcurrency: 4,
    deviceMemory: 4,
    extraConfig: null,
  },
  {
    name: "Android Chrome",
    slug: "android-chrome",
    deviceType: "MOBILE",
    osName: "ANDROID",
    osVersion: "15",
    browserName: "CHROME_MOBILE",
    browserVersion: "132",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    language: "en-US",
    timezone: "America/Chicago",
    locale: "en-US",
    viewportWidth: 412,
    viewportHeight: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    canvasMode: "none",
    canvasSeed: null,
    webglVendor: "Qualcomm",
    webglRenderer: "Adreno (TM) 740",
    hardwareConcurrency: 4,
    deviceMemory: 4,
    extraConfig: null,
  },
  {
    name: "Windows Chrome",
    slug: "windows-chrome",
    deviceType: "DESKTOP",
    osName: "WINDOWS",
    osVersion: "11",
    browserName: "CHROME",
    browserVersion: "132",
    userAgent:
      "Mozilla/5.0 (Windows NT; Windows NT 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    language: "en-US",
    timezone: "America/Chicago",
    locale: "en-US",
    viewportWidth: 1920,
    viewportHeight: 1080,
    deviceScaleFactor: 1.0,
    isMobile: false,
    hasTouch: false,
    canvasMode: "none",
    canvasSeed: null,
    webglVendor: "Google Inc. (NVIDIA)",
    webglRenderer:
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    extraConfig: null,
  },
  {
    name: "MacOS Safari",
    slug: "macos-safari",
    deviceType: "DESKTOP",
    osName: "MACOS",
    osVersion: "13.4",
    browserName: "SAFARI",
    browserVersion: "13.4",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/603.3 (KHTML, like Gecko) Version/13.4 Safari/603.3",
    language: "en-US",
    timezone: "America/Chicago",
    locale: "en-US",
    viewportWidth: 1366,
    viewportHeight: 768,
    deviceScaleFactor: 1.0,
    isMobile: false,
    hasTouch: false,
    canvasMode: "none",
    canvasSeed: null,
    webglVendor: "Apple Inc.",
    webglRenderer: "Apple M2",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    extraConfig: null,
  },
];

export const BROWSER_BEHAVIOUR_PROFILE: BrowserBehaviourConfig[] = [
  {
    name: "Default Reader",
    slug: "default-reader",
    minDwellSeconds: 15,
    maxDwellSeconds: 90,
    minScrollCount: 3,
    maxScrollCount: 10,
    scrollSpeedMin: 150,
    scrollSpeedMax: 400,
    enableInternalNav: false,
    maxInternalClicks: 0,
    clickSelectors: [],
  },
  {
    name: "Deep Engager",
    slug: "deep-engager",
    minDwellSeconds: 60,
    maxDwellSeconds: 300,
    minScrollCount: 5,
    maxScrollCount: 20,
    scrollSpeedMin: 200,
    scrollSpeedMax: 600,
    enableInternalNav: true,
    maxInternalClicks: 3,
    clickSelectors: [],
  },
  {
    name: "Quick Scanner",
    slug: "quick-scanner",
    minDwellSeconds: 15,
    maxDwellSeconds: 90,
    minScrollCount: 3,
    maxScrollCount: 10,
    scrollSpeedMin: 150,
    scrollSpeedMax: 400,
    enableInternalNav: false,
    maxInternalClicks: 0,
    clickSelectors: [],
  },
];

export function getViewport(
  deviceType: DeviceType,
  osName: OSName,
): { width: number; height: number; deviceScaleFactor: number } {
  let presetKey = `${deviceType}_${osName}`;

  if (deviceType === "DESKTOP") {
    if (osName === "WINDOWS") presetKey = "DESKTOP_WINDOWS";
    else if (osName === "LINUX") presetKey = "DESKTOP_LINUX";
    else presetKey = "DESKTOP_MACOS";
  } else {
    if (osName === "ANDROID") presetKey = "MOBILE_ANDROID";
    else presetKey = "MOBILE_IOS";
  }

  const preset = VIEWPORT_PRESETS[presetKey];
  return {
    width: preset?.[0] ?? 1366,
    height: preset?.[1] ?? 768,
    deviceScaleFactor: preset?.[2] ?? 1,
  };
}

export function getWebGLVendor(
  engine: BrowserEngine,
  osName: OSName,
  browserName: BrowserName,
): { vendor: string; renderer: string } {
  let key = `${browserName}_${osName}`;

  if (browserName === "CHROME" && osName === "WINDOWS") key = "CHROME_WINDOWS";
  else if (browserName === "CHROME" && osName === "LINUX") key = "CHROME_LINUX";
  else if (browserName === "CHROME" && osName === "MACOS") key = "CHROME_MACOS";
  else if (browserName === "CHROME_MOBILE" && osName === "ANDROID")
    key = "CHROME_MOBILE_ANDROID";
  else if (browserName === "SAFARI_MOBILE" && osName === "IOS")
    key = "SAFARI_MOBILE_IOS";
  else if (browserName === "FIREFOX" && osName === "WINDOWS")
    key = "FIREFOX_WINDOWS";
  else if (browserName === "FIREFOX" && osName === "LINUX")
    key = "FIREFOX_LINUX";
  else if (browserName === "FIREFOX" && osName === "MACOS")
    key = "FIREFOX_MACOS";
  else if (browserName === "SAFARI" && osName === "MACOS") key = "SAFARI_MACOS";
  else if (browserName === "EDGE" && osName === "WINDOWS") key = "EDGE_WINDOWS";

  return (
    WEBGL_PRESETS[key] || {
      vendor: "Google Inc.",
      renderer: "ANGLE (Generic)",
    }
  );
}

export function generateUserAgent(
  browserName: BrowserName,
  browserVersion: string,
  osName: OSName,
  osVersion: string,
  deviceType: DeviceType,
): string {
  const platformMap: Record<OSName, string> = {
    WINDOWS: `Windows NT ${osVersion === "11" ? "10.0" : "10.0"}`,
    LINUX: "X11; Linux x86_64",
    MACOS: `Macintosh; Intel Mac OS X ${osVersion.replace(".", "_")}`,
    ANDROID: `Linux; Android ${osVersion}`,
    IOS: `iPhone; CPU iPhone OS ${osVersion.replace(".", "_")} like Mac OS X`,
  };

  const platform = platformMap[osName];

  const chromeVersion = browserVersion.split(".")[0];

  switch (browserName) {
    case "CHROME":
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion}.0.0.0 Safari/537.36`;
    case "CHROME_MOBILE":
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion}.0.0.0 Mobile Safari/537.36`;
    case "FIREFOX":
      return `Mozilla/5.0 (${platform}; rv:${browserVersion}.0) Gecko/20100101 Firefox/${browserVersion}.0`;
    case "FIREFOX_MOBILE":
      return `Mozilla/5.0 (Android ${osVersion}; Mobile; rv:${browserVersion}.0) Gecko/${browserVersion}.0 Firefox/${browserVersion}.0`;
    case "SAFARI":
      return `Mozilla/5.0 (${platform}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browserVersion}.0 Safari/605.1.15`;
    case "SAFARI_MOBILE":
      return `Mozilla/5.0 (${platform}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browserVersion}.0 Mobile/15E148 Safari/604.1`;
    case "EDGE":
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36 Edg/${browserVersion}.0.0.0`;
    default:
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`;
  }
}

export function getBehaviourProfile(behaviour: string): BrowserBehaviourConfig {
  return (
    BROWSER_BEHAVIOUR_PROFILE.find((profile) => profile.slug === behaviour) ??
    (BROWSER_BEHAVIOUR_PROFILE[0] as BrowserBehaviourConfig)
  );
}

export function getFingerprintProfile(fingerprint: string): FingerprintHint {
  return (
    FINGERPRINT_PROFILE.find((profile) => profile.slug === fingerprint) ??
    (FINGERPRINT_PROFILE[0] as FingerprintHint)
  );
}
