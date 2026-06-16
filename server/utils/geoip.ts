import fs from "node:fs";
import path from "node:path";
import { cacheGetJSON, cacheSetJSON } from "./queue";

// =====================================================================
// GeoIP hybrid (Fase 3)
// Primary: DB lokal MaxMind GeoLite2 (City + ASN) bila file tersedia.
// Fallback / pelengkap: ip-api.com (punya flag `mobile` & `hosting`).
// Hasil di-cache di Redis (key geoip:<ip>) untuk hindari lookup berulang.
// =====================================================================

export interface GeoResult {
  country: string | null; // ISO-2
  region: string | null;
  city: string | null;
  asn: number | null;
  asnOrg: string | null;
  isMobile: boolean;
  usageType: string; // MOB | DCH | ISP
  source: string; // local | ip-api | mixed
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 7 hari

// Heuristik nama operator seluler (dipakai saat hanya ada DB lokal).
const MOBILE_RE =
  /\b(mobile|cellular|wireless|telkomsel|indosat|smartfren|xl axiata|axis|hutchison|t-?mobile|vodafone|orange|telcel|airtel|reliance jio|jio|verizon wireless|at&?t mobility|claro|movistar|mtn|safaricom|grameenphone|robi|dtac|\bais\b|viettel|mobifone|globe|smart communications)\b/i;

function looksMobile(org?: string | null): boolean {
  return !!org && MOBILE_RE.test(org);
}

function parseAs(
  asField?: string,
  asname?: string,
): { asn: number | null; asnOrg: string | null } {
  if (!asField) return { asn: null, asnOrg: asname || null };
  const m = asField.match(/^AS(\d+)\s*(.*)$/i);
  if (m) {
    return {
      asn: Number(m[1]),
      asnOrg: (m[2] || asname || "").trim() || null,
    };
  }
  return { asn: null, asnOrg: asField };
}

// ── Provider lokal (MaxMind) — opsional ───────────────────────────────
let localTried = false;
let localAvailable = false;
let cityReader: any = null;
let asnReader: any = null;

async function ensureLocalReaders(): Promise<boolean> {
  if (localTried) return localAvailable;
  localTried = true;
  try {
    const cityPath =
      process.env.GEOIP_CITY_DB ||
      path.resolve(process.cwd(), "geoip/GeoLite2-City.mmdb");
    const asnPath =
      process.env.GEOIP_ASN_DB ||
      path.resolve(process.cwd(), "geoip/GeoLite2-ASN.mmdb");
    const hasCity = fs.existsSync(cityPath);
    const hasAsn = fs.existsSync(asnPath);
    if (!hasCity && !hasAsn) {
      localAvailable = false;
      return false;
    }
    // specifier non-literal → tidak diresolve TS; aman bila paket belum dipasang
    const modName = "maxmind";
    const mod: any = await import(modName);
    const maxmind = mod.default ?? mod;
    if (hasCity) cityReader = await maxmind.open(cityPath);
    if (hasAsn) asnReader = await maxmind.open(asnPath);
    localAvailable = !!(cityReader || asnReader);
    if (localAvailable) console.log("🗺️  GeoIP lokal (MaxMind) aktif");
    return localAvailable;
  } catch (err) {
    console.warn(
      "GeoIP lokal nonaktif (maxmind/DB tidak tersedia):",
      err instanceof Error ? err.message : err,
    );
    localAvailable = false;
    return false;
  }
}

function lookupLocal(ip: string): Partial<GeoResult> | null {
  if (!localAvailable) return null;
  const out: Partial<GeoResult> = {};
  try {
    if (cityReader) {
      const c = cityReader.get(ip);
      if (c) {
        out.country = c.country?.iso_code ?? null;
        out.region = c.subdivisions?.[0]?.names?.en ?? null;
        out.city = c.city?.names?.en ?? null;
      }
    }
    if (asnReader) {
      const a = asnReader.get(ip);
      if (a) {
        out.asn = a.autonomous_system_number ?? null;
        out.asnOrg = a.autonomous_system_organization ?? null;
      }
    }
  } catch {
    /* ip tidak ditemukan */
  }
  return out;
}

// ── Provider online (ip-api) ──────────────────────────────────────────
interface IpApiPartial extends Partial<GeoResult> {
  isHosting?: boolean;
}

async function lookupIpApi(ip: string): Promise<IpApiPartial | null> {
  const url = `http://ip-api.com/json/${ip}?fields=status,message,countryCode,regionName,city,mobile,proxy,hosting,as,asname,query`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j: any = await res.json();
    if (j.status !== "success") return null;
    const { asn, asnOrg } = parseAs(j.as, j.asname);
    return {
      country: j.countryCode || null,
      region: j.regionName || null,
      city: j.city || null,
      asn,
      asnOrg,
      isMobile: !!j.mobile,
      isHosting: !!j.hosting,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function deriveUsageType(isMobile: boolean, isHosting: boolean): string {
  if (isMobile) return "MOB";
  if (isHosting) return "DCH";
  return "ISP";
}

/**
 * Lookup hybrid untuk satu IP. Mengembalikan null bila tak ada sumber
 * yang berhasil (mis. ip-api rate-limit & tidak ada DB lokal).
 */
export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  const cacheKey = `geoip:${ip}`;
  const cached = await cacheGetJSON<GeoResult>(cacheKey);
  if (cached) return cached;

  await ensureLocalReaders();
  const local = lookupLocal(ip);

  // Jika lokal yakin mobile dari nama operator → tak perlu ip-api.
  if (local && local.asnOrg && looksMobile(local.asnOrg)) {
    const result: GeoResult = {
      country: local.country ?? null,
      region: local.region ?? null,
      city: local.city ?? null,
      asn: local.asn ?? null,
      asnOrg: local.asnOrg ?? null,
      isMobile: true,
      usageType: "MOB",
      source: "local",
    };
    await cacheSetJSON(cacheKey, result, CACHE_TTL);
    return result;
  }

  // Selain itu: konsultasi ip-api (flag mobile/hosting otoritatif), lalu
  // gabungkan dengan data lokal (lokal diutamakan untuk geo/asn).
  const api = await lookupIpApi(ip);

  if (!api && !local) return null;

  const isMobile = api?.isMobile ?? looksMobile(local?.asnOrg);
  const isHosting = api?.isHosting ?? false;
  const result: GeoResult = {
    country: local?.country ?? api?.country ?? null,
    region: local?.region ?? api?.region ?? null,
    city: local?.city ?? api?.city ?? null,
    asn: local?.asn ?? api?.asn ?? null,
    asnOrg: local?.asnOrg ?? api?.asnOrg ?? null,
    isMobile: !!isMobile,
    usageType: deriveUsageType(!!isMobile, isHosting),
    source: local && api ? "mixed" : local ? "local" : "ip-api",
  };
  await cacheSetJSON(cacheKey, result, CACHE_TTL);
  return result;
}
