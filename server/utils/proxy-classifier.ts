import type { ProxyCategory } from "@prisma/client";
import { prisma } from "./database";
import { lookupGeo } from "./geoip";
import { ensureDefaultPools } from "./proxy";

// =====================================================================
// Klasifikasi proxy (Fase 3)
// Dari exit-IP → tentukan geo/ASN + mobile vs residential, isi field
// proxy, set category, lalu sinkronkan keanggotaan pool default.
// =====================================================================

export interface ClassifyResult {
  category: ProxyCategory;
  isMobile: boolean;
  country: string | null;
  asnOrg: string | null;
  source: string;
}

/**
 * Sinkronkan proxy ke pool default kategori yang sesuai:
 * - tambahkan ke pool default kategori target
 * - keluarkan dari pool default kategori lawan (kalau pindah kategori)
 */
async function syncDefaultPoolMembership(
  userId: string,
  proxyId: string,
  category: ProxyCategory,
) {
  const pools = await ensureDefaultPools(userId);
  const target = pools[category];
  const other =
    category === "MOBILE_ROTATING"
      ? pools.RESIDENTIAL_ROTATING
      : pools.MOBILE_ROTATING;

  await prisma.proxyPoolMember.upsert({
    where: {
      pool_member_pool_proxy_unique: { poolId: target.id, proxyId },
    },
    create: { poolId: target.id, proxyId },
    update: { enabled: true },
  });

  await prisma.proxyPoolMember.deleteMany({
    where: { poolId: other.id, proxyId },
  });
}

/**
 * Klasifikasi satu proxy berdasarkan exit-IP. Mengembalikan hasil, atau
 * null bila GeoIP tak bisa di-resolve (mis. rate-limit & tanpa DB lokal).
 */
export async function classifyProxy(
  proxy: { id: string; userId: string },
  exitIp: string,
): Promise<ClassifyResult | null> {
  const geo = await lookupGeo(exitIp);
  if (!geo) return null;

  const category: ProxyCategory = geo.isMobile
    ? "MOBILE_ROTATING"
    : "RESIDENTIAL_ROTATING";

  await prisma.proxy.update({
    where: { id: proxy.id },
    data: {
      category,
      isMobile: geo.isMobile,
      usageType: geo.usageType,
      classificationSource: geo.source,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      asn: geo.asn,
      asnOrg: geo.asnOrg,
    },
  });

  await syncDefaultPoolMembership(proxy.userId, proxy.id, category);

  return {
    category,
    isMobile: geo.isMobile,
    country: geo.country,
    asnOrg: geo.asnOrg,
    source: geo.source,
  };
}
