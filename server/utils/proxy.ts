import { randomBytes } from "node:crypto";
import type { ProxyCategory, ProxyPool } from "@prisma/client";
import { prisma } from "./database";

// =====================================================================
// Helper domain proxy (Fase 1)
// =====================================================================

/**
 * Generate kredensial gateway untuk sebuah pool.
 * Username dipakai client untuk memilih pool saat connect ke gateway:
 *   http://<gatewayUsername>:<gatewayPassword>@gateway:10000
 * Opsi tambahan (country/session/type) nanti di-encode di belakang username
 * saat fitur gateway dibangun (Fase 5), mis. `user-country-us-session-abc`.
 */
export function genGatewayCredentials(prefix = "pool"): {
  username: string;
  password: string;
} {
  const username = `${prefix}_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(16).toString("hex");
  return { username, password };
}

const DEFAULT_POOLS: { category: ProxyCategory; name: string }[] = [
  { category: "RESIDENTIAL_ROTATING", name: "Residential — Default" },
  { category: "MOBILE_ROTATING", name: "Mobile — Default" },
];

/**
 * Pastikan setiap user punya 2 pool default (Residential & Mobile).
 * Idempotent — aman dipanggil berkali-kali. Mengembalikan pool default per kategori.
 */
export async function ensureDefaultPools(
  userId: string,
): Promise<Record<ProxyCategory, ProxyPool>> {
  const existing = await prisma.proxyPool.findMany({
    where: { userId, isDefault: true, deletedAt: null },
  });

  const byCategory = new Map<ProxyCategory, ProxyPool>();
  for (const pool of existing) byCategory.set(pool.category, pool);

  for (const def of DEFAULT_POOLS) {
    if (byCategory.has(def.category)) continue;
    const { username, password } = genGatewayCredentials(
      def.category === "MOBILE_ROTATING" ? "mob" : "res",
    );
    const created = await prisma.proxyPool.create({
      data: {
        name: def.name,
        category: def.category,
        isDefault: true,
        gatewayUsername: username,
        gatewayPassword: password,
        userId,
      },
    });
    byCategory.set(def.category, created);
  }

  return {
    RESIDENTIAL_ROTATING: byCategory.get("RESIDENTIAL_ROTATING")!,
    MOBILE_ROTATING: byCategory.get("MOBILE_ROTATING")!,
  };
}
