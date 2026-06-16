import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash, compare } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaClient, type UserRole } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function generateApiKey(byteLength = 16): string {
  const timestamp = Date.now().toString(36);

  const randomString = randomBytes(byteLength).toString("hex");

  return `sk_live_${timestamp}_${randomString}`;
}

async function main() {
  console.log("🌱 Starting seed...");

  const superadminEmail =
    process.env.ADMIN_EMAIL || "support@smartboostlabs.com";
  const superadminPassword = process.env.ADMIN_PASSWORD || "support@1234";
  const superadminName = process.env.ADMIN_NAME || "Support";

  console.log("📋 Creating roles...");
  const roles = [
    { name: "superadmin", level: 0 },
    { name: "admin", level: 1 },
    { name: "user", level: 2 },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: {
        role_name_level_unique: {
          name: role.name as UserRole,
          level: role.level,
        },
      },
      update: {},
      create: {
        name: role.name as UserRole,
        level: role.level,
      },
    });
    console.log(`  ✅ Role: ${role.name} (level ${role.level})`);
  }

  // ── Superadmin User ──────────────────────────────────────────
  console.log("  → Seeding superadmin user...");
  const superadminRole = await prisma.role.findUnique({
    where: { role_name_level_unique: { name: "superadmin", level: 0 } },
  });
  if (!superadminRole) throw new Error("SuperAdmin role not found");

  const superadmin = await prisma.user.upsert({
    where: { email: superadminEmail },
    update: {
      email: superadminEmail,
      name: superadminName,
    },
    create: {
      email: superadminEmail,
      passwordHash: await hash(superadminPassword, 10),
      name: superadminName,
      role_id: superadminRole.id,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      apiKey: generateApiKey(),
      apiKeyCreatedAt: new Date(),
    },
  });

  const quota = await prisma.userQuota.create({
    data: {
      userId: superadmin.id,
      quotaBytes: 1024 * 1024 * 1024 * 100, // default create 10 GB
      quotaRequests: 100000, // default create 1000 requests
      usedBytes: 0,
      usedRequests: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log("\n⚙️  Creating default settings...");
  const settings = [
    // General
    { key: "site_name", value: "Residential Proxy", group_name: "general" },
    {
      key: "site_description",
      value: "Residential Proxy",
      group_name: "general",
    },
    { key: "site_keywords", value: "Residential Proxy", group_name: "general" },
    { key: "site_icon", value: "/logo.png", group_name: "general" },
    { key: "site_logo", value: "/logo-small.png", group_name: "general" },
    { key: "site_favicon", value: "/favicon.ico", group_name: "general" },
    { key: "site_theme", value: "dark", group_name: "general" },
    { key: "is_maintenance", value: "false", group_name: "general" },
    // Auth
    { key: "enable_register", value: "true", group_name: "auth" },
    { key: "enable_github_provider", value: "true", group_name: "auth" },
    { key: "enable_google_provider", value: "true", group_name: "auth" },
    // Storage
    { key: "max_upload_size_mb", value: "50", group_name: "storage" },
    { key: "max_upload_image_mb", value: "10", group_name: "storage" },
    { key: "max_upload_video_mb", value: "500", group_name: "storage" },
    { key: "max_upload_audio_mb", value: "50", group_name: "storage" },
    { key: "max_upload_document_mb", value: "20", group_name: "storage" },
    { key: "max_upload_code_mb", value: "5", group_name: "storage" },
    { key: "max_upload_archive_mb", value: "100", group_name: "storage" },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: {
        setting_key_group_name_unique: {
          key: setting.key,
          group_name: setting.group_name,
        },
      },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`  ✅ ${settings.length} settings dibuat`);

  console.log("✅ Seed complete!");
  console.log("");
  console.log(
    `  Superadmin: ${superadminEmail} / ${process.env.ADMIN_PASSWORD ? "(from ADMIN_PASSWORD)" : superadminPassword}`,
  );
  console.log(`  API Key: ${superadmin.apiKey}`);
  console.log(`  API Key Created At: ${superadmin.apiKeyCreatedAt}`);
  console.log(
    `  Quota: ${quota.quotaBytes} bytes, ${quota.quotaRequests} requests`,
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
