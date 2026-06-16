import * as z from "zod";
import { toTypedSchema } from "@vee-validate/zod";

// ===========================================
// General Validations
// ===========================================
export const emptyStringToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  return value;
};
const dateSchema = z.date().refine(
  (val) => {
    // Reset jam ke 00:00 untuk perbandingan tanggal murni
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    oneYearFromNow.setHours(23, 59, 59, 999);

    return val >= today && val <= oneYearFromNow;
  },
  {
    message: "Date must be between today and 1 year in the future",
  },
);
const formDateSchema = z.coerce.date().refine(
  (val) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    return val >= today && val <= oneYearFromNow;
  },
  { message: "Input cannot be less than today or more than 1 year old" },
);
export const getDynamicDates = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  oneYearFromNow.setHours(23, 59, 59, 999);

  return { today, oneMonthFromNow, oneYearFromNow };
};
const expiredAtSchema = z
  .union([
    z.date(),
    z
      .string()
      .datetime({ offset: true })
      .transform((val) => new Date(val)),
  ])
  // Mengisi default secara dinamis setiap kali fungsi parse dipanggil
  .default(() => getDynamicDates().oneMonthFromNow)
  // Validasi batas minimal hari ini dan maksimal 1 tahun
  .refine(
    (val) => {
      const { today, oneYearFromNow } = getDynamicDates();
      const dateVal = val instanceof Date ? val : new Date(val);
      return dateVal >= today && dateVal <= oneYearFromNow;
    },
    {
      message:
        "Tanggal kedaluwarsa harus antara hari ini hingga 1 tahun ke depan",
    },
  );

// ===========================================
// Auth Validations
// ===========================================

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Format email is not valid."),
  password: z
    .string()
    .min(1, "Password is required.")
    .min(8, "Password must be at least 8 characters."),
});
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required.")
      .min(2, "Name must be at least 2 characters.")
      .max(100, "Name must be at most 100 characters.")
      .regex(
        /^[a-zA-Z\s'-]+$/,
        "Name must contain only letters, spaces, apostrof, and strip.",
      ),
    email: z
      .string()
      .min(1, "Email is required.")
      .email("Format email is not valid.")
      .max(255, "Email is too long."),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters long" })
      .max(32, { message: "Password must be at most 32 characters long" })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[0-9]/, { message: "Password must contain at least one number" })
      .regex(/[^a-zA-Z0-9]/, {
        message: "Password must contain at least one special character",
      })
      .trim(),
    confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi."),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password do not match.",
        path: ["confirmPassword"],
      });
    }
  });
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Format email is not valid."),
});
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Token is required."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password must be at most 72 characters.")
      .regex(/[A-Z]/, "Password must contain uppercase letters.")
      .regex(/[0-9]/, "Password must contain numbers."),
    confirmPassword: z.string().min(1, "Konfirmasi password is required."),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Password do not match.",
      });
    }
  });
export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required."),
});

// ===========================================
// User Profile Validations
// ===========================================

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name must be at most 100 characters.")
    .optional(),
  avatar: z.string().nullable().optional(),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password must be at most 72 characters.")
      .regex(/[A-Z]/, "Password must contain uppercase letters.")
      .regex(/[0-9]/, "Password must contain numbers."),
    confirmNewPassword: z.string().min(1, "Password confirmation is required."),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password do not match.",
        path: ["confirmNewPassword"],
      });
    }
  });

export const updateAvatarOnlySchema = z.object({
  avatar: z
    .string()
    .url("URL avatar is not valid.")
    .optional()
    .transform((v) => v ?? ""),
});

// ===========================================
// App Setting Validations
// ===========================================

export const saveApiKeySchema = z.object({
  provider: z.string().min(1, "Provider is required."),
  api_key: z
    .string()
    .min(8, "API key must be at least 8 characters.")
    .max(500, "API key is too long."),
  label: z
    .string()
    .max(100, "Label is too long.")
    .optional()
    .transform((v) => v ?? ""),
});

const siteAssetSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (!value) return true;
      if (value.startsWith("/")) return true;
      return /^https?:\/\/.+/i.test(value);
    },
    {
      message: "Must be a valid URL or root-relative path",
    },
  );

export const webSettingsSchema = z.object({
  site_name: z.string().min(1).max(100),
  site_description: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v ?? ""),
  site_keywords: z
    .string()
    .max(255)
    .optional()
    .transform((v) => v ?? ""),
  site_icon: siteAssetSchema.optional().transform((v) => v ?? ""),
  site_logo: siteAssetSchema.optional().transform((v) => v ?? ""),
  site_favicon: siteAssetSchema.optional().transform((v) => v ?? ""),
});
export const generalSettingSchema = z.object({
  site_theme: z.enum(["light", "dark", "system"]).default("dark"),
  is_maintenance: z.boolean(),
  enable_register: z.boolean(),
  enable_github_provider: z.boolean(),
  enable_google_provider: z.boolean(),
  max_upload_size_mb: z.number().int().positive(),
  max_upload_image_mb: z.number().int().positive(),
  max_upload_video_mb: z.number().int().positive(),
  max_upload_audio_mb: z.number().int().positive(),
  max_upload_document_mb: z.number().int().positive(),
  max_upload_code_mb: z.number().int().positive(),
  max_upload_archive_mb: z.number().int().positive(),
});

// ============================================================
// Admin Users
// ============================================================
export const userRole = z.enum(["superadmin", "admin", "user"]);
export const statusActive = z.enum(["active", "inactive"]);
export const inviteUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .max(32, { message: "Password must be at most 32 characters long" })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[^a-zA-Z0-9]/, {
      message: "Password must contain at least one special character",
    })
    .trim(),
  quotaBytes: z.coerce
    .number()
    .int()
    .min(0)
    .default(1024 * 1024 * 1024 * 10), // default create 10 GB
  quotaRequests: z.coerce.number().int().min(0).default(1000), // default create 1000 requests
  // expiredAt: expiredAtSchema,
  isActive: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
});
export const listUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: statusActive.optional(),
  role: userRole.optional(),
  search: z.string().max(100).optional(),
  orderBy: z
    .enum(["id", "email", "name", "createdAt", "updatedAt"])
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("asc"),
});
export const assignRoleSchema = z.object({
  role: userRole,
});
export const setStatusActiveSchema = z.object({
  status: statusActive,
});
export const updateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional().nullable(),
  quotaBytes: z.coerce
    .number()
    .int()
    .min(0)
    .default(1024 * 1024 * 1024 * 10), // default create 10 GB
  quotaRequests: z.coerce.number().int().min(0).default(1000), // default create 1000 requests
  isActive: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
});

// ============================================================
// Proxy Domain (Fase 1)
// ============================================================
export const proxyProtocol = z.enum(["http", "https", "socks5"]);
export const proxyCategory = z.enum([
  "RESIDENTIAL_ROTATING",
  "MOBILE_ROTATING",
]);
export const proxyStatus = z.enum([
  "pending",
  "checking",
  "active",
  "dead",
  "banned",
]);

export const importProxiesSchema = z.object({
  raw: z
    .string()
    .min(3, "Daftar proxy tidak boleh kosong.")
    .max(500_000, "Daftar proxy terlalu besar (maks ~500KB)."),
  defaultProtocol: proxyProtocol.default("http"),
  sourceLabel: z
    .string()
    .max(150, "Label terlalu panjang.")
    .optional()
    .transform((v) => v?.trim() || undefined),
});

export const listProxiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: proxyStatus.optional(),
  category: proxyCategory.optional(),
  protocol: proxyProtocol.optional(),
  country: z.string().length(2).optional(),
  search: z.string().max(255).optional(),
  orderBy: z
    .enum(["createdAt", "latencyMs", "uptimeScore", "lastCheckedAt"])
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const bulkDeleteProxiesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pilih minimal 1 proxy.").max(1000),
});

export const enqueueChecksSchema = z
  .object({
    scope: z.enum(["selected", "pending", "all"]).default("pending"),
    ids: z.array(z.string().uuid()).max(5000).optional(),
    method: z.enum(["fast", "playwright"]).default("fast"),
  })
  .refine((d) => d.scope !== "selected" || (d.ids && d.ids.length > 0), {
    message: "scope 'selected' butuh ids.",
    path: ["ids"],
  });

export const scrapeSourceEnum = z.enum([
  "free-proxy-list",
  "sslproxies",
  "us-proxy",
  "spys-one",
  "proxyscrape",
  "proxy-daily",
  "sunny-proxy",
]);
export const scrapeAnonymityEnum = z.enum([
  "transparent",
  "anonymous",
  "elite",
]);

export const startScrapeSchema = z.object({
  sources: z.array(scrapeSourceEnum).min(1, "Pilih minimal 1 sumber.").max(7),
  country: z
    .string()
    .length(2)
    .optional()
    .transform((v) => v?.toUpperCase() || undefined),
  protocol: proxyProtocol.optional(),
  anonymity: scrapeAnonymityEnum.optional(),
});

export const reportProxySchema = z
  .object({
    host: z.string().max(255).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    proxy: z.string().max(300).optional(), // "host:port"
    protocol: proxyProtocol.optional(),
    session: z.string().max(200).optional(),
    poolUsername: z.string().max(64).optional(),
    dead: z.boolean().optional().default(false), // true = langsung dead
    reason: z.string().max(200).optional(),
  })
  .refine(
    (d) => !!(d.host && d.port) || !!d.proxy || !!(d.session && d.poolUsername),
    {
      message:
        "Sertakan host+port, atau proxy 'host:port', atau session+poolUsername.",
    },
  );

export const ImportProxiesSchema = toTypedSchema(importProxiesSchema);
export const StartScrapeSchema = toTypedSchema(startScrapeSchema);
export type StartScrapeInput = z.infer<typeof startScrapeSchema>;

// ── Pool (Fase 5) ─────────────────────────────────────────
export const rotationMode = z.enum(["per_request", "sticky"]);

export const createPoolSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi.").max(150),
  category: proxyCategory,
  rotationMode: rotationMode.default("per_request"),
  stickyTtlSec: z.coerce.number().int().min(10).max(86400).optional(),
});

export const updatePoolSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  rotationMode: rotationMode.optional(),
  stickyTtlSec: z.coerce
    .number()
    .int()
    .min(10)
    .max(86400)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  filterCountry: z
    .string()
    .length(2)
    .nullable()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : v)),
  filterProtocol: proxyProtocol.nullable().optional(),
});

// ── Quota (Fase 7) ────────────────────────────────────────
export const setQuotaSchema = z.object({
  // GB; null = unlimited; undefined = jangan ubah
  quotaGb: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  quotaRequests: z.coerce.number().int().min(0).nullable().optional(),
  resetUsed: z.boolean().optional().default(false),
});
export const SetQuotaSchema = toTypedSchema(setQuotaSchema);
export type SetQuotaInput = z.infer<typeof setQuotaSchema>;

// ===========================================
// Additional Tools Service
// ===========================================

export const toolsScrapeSource = z.enum([
  "free-proxy-list",
  "sslproxies",
  "us-proxy",
  "spys-one",
  "proxyscrape",
  "proxy-daily",
  "sunny-proxy",
  "geonode",
  "hide-mn",
  "openproxy",
  "openproxylist",
  "proxydb",
  "proxynova",
  "freeproxy-world",
]);

export const SOURCE_VALUES = [
  "all",
  "free-proxy-list",
  "sslproxies",
  "us-proxy",
  "spys-one",
  "proxyscrape",
  "proxy-daily",
  "sunny-proxy",
  "geonode",
  "hide-mn",
  "openproxy",
  "openproxylist",
  "proxydb",
  "proxynova",
  "freeproxy-world",
] as const;

export const PROTOCOL_VALUES = ["all", "http", "https", "socks5"] as const;
export const ANONYMITY_VALUES = [
  "all",
  "transparent",
  "anonymous",
  "elite",
] as const;

export type SourceType = (typeof SOURCE_VALUES)[number];
export type ProtocolType = (typeof PROTOCOL_VALUES)[number];
export type AnonymityType = (typeof ANONYMITY_VALUES)[number];

export const toolsScrapeSchema = z.object({
  sources: z
    .enum(SOURCE_VALUES)
    .default("proxyscrape")
    .transform((val) => {
      return val === "all" ? undefined : val;
    })
    .optional(),

  country: z
    .string()
    .trim()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      return val.toUpperCase();
    })
    .refine(
      (val) => {
        if (!val) return true;
        return val.length === 2;
      },
      { message: "Country must be 2 characters (ISO 3166-1 alpha-2)" },
    ),

  protocol: z
    .enum(PROTOCOL_VALUES)
    .default("all")
    .transform((val) => {
      return val === "all" ? undefined : val;
    })
    .optional(),

  anonymity: z
    .enum(ANONYMITY_VALUES)
    .default("all")
    .transform((val) => {
      return val === "all" ? undefined : val;
    })
    .optional(),
});

export const CreatePoolSchema = toTypedSchema(createPoolSchema);
export const UpdatePoolSchema = toTypedSchema(updatePoolSchema);
export type CreatePoolInput = z.infer<typeof createPoolSchema>;
export type UpdatePoolInput = z.infer<typeof updatePoolSchema>;
export const ListProxiesQuerySchema = toTypedSchema(listProxiesQuerySchema);

export type ImportProxiesInput = z.infer<typeof importProxiesSchema>;
export type ListProxiesQueryInput = z.infer<typeof listProxiesQuerySchema>;
export type BulkDeleteProxiesInput = z.infer<typeof bulkDeleteProxiesSchema>;

export const LoginSchema = toTypedSchema(loginSchema);
export const RegisterSchema = toTypedSchema(registerSchema);
export const ForgotPasswordSchema = toTypedSchema(forgotPasswordSchema);
export const ResetPasswordSchema = toTypedSchema(resetPasswordSchema);
export const VerifyEmailSchema = toTypedSchema(verifyEmailSchema);

export const UpdateProfileSchema = toTypedSchema(updateProfileSchema);
export const ChangePasswordSchema = toTypedSchema(changePasswordSchema);
export const UpdateAvatarOnlySchema = toTypedSchema(updateAvatarOnlySchema);

export const SaveApiKeySchema = toTypedSchema(saveApiKeySchema);
export const WebSettingsSchema = toTypedSchema(webSettingsSchema);
export const GeneralSettingSchema = toTypedSchema(generalSettingSchema);

export const UserRole = toTypedSchema(userRole);
export const StatusActive = toTypedSchema(statusActive);
export const InviteUserSchema = toTypedSchema(inviteUserSchema);
export const ListUserQuerySchema = toTypedSchema(listUserQuerySchema);
export const AssignRoleSchema = toTypedSchema(assignRoleSchema);
export const SetActiveSchema = toTypedSchema(setStatusActiveSchema);
export const UpdateUserSchema = toTypedSchema(updateUserSchema);

export const ToolsScrapeSource = toTypedSchema(toolsScrapeSource);
export const ToolsScrapeSchema = toTypedSchema(toolsScrapeSchema);

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateAvatarOnlyInput = z.infer<typeof updateAvatarOnlySchema>;

export type SaveApiKeyInput = z.infer<typeof saveApiKeySchema>;
export type WebSettingsInput = z.infer<typeof webSettingsSchema>;
export type GeneralSettingInput = z.infer<typeof generalSettingSchema>;

export type UserRoleInput = z.infer<typeof userRole>;
export type StatusActiveInput = z.infer<typeof statusActive>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type ListUserQueryInput = z.infer<typeof listUserQuerySchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type SetActiveInput = z.infer<typeof setStatusActiveSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export type ToolsScrapeSourceInput = z.infer<typeof toolsScrapeSource>;
export type ToolsScrapeOutput = z.output<typeof toolsScrapeSchema>;
export type ToolsScrapeInput = z.infer<typeof toolsScrapeSchema>;
