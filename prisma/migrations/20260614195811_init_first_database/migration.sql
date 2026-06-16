-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'superadmin');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" "UserRole" NOT NULL DEFAULT 'user',
    "level" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "name" VARCHAR(255),
    "avatar_url" VARCHAR(500),
    "timezone" VARCHAR(100) DEFAULT 'UTC',
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "last_login_ip" VARCHAR(45),
    "oauth_provider" VARCHAR(50),
    "oauth_provider_id" VARCHAR(255),
    "api_key" VARCHAR(64),
    "api_key_created_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "level" VARCHAR(20) NOT NULL,
    "service" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_name_idx" ON "roles"("name");

-- CreateIndex
CREATE INDEX "role_level_idx" ON "roles"("level");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_level_key" ON "roles"("name", "level");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");

-- CreateIndex
CREATE INDEX "idx_users_role_id" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "idx_users_api_key" ON "users"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_role_id_key" ON "users"("email", "role_id");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "account_provider_idx" ON "accounts"("provider");

-- CreateIndex
CREATE INDEX "account_created_at_idx" ON "accounts"("created_at");

-- CreateIndex
CREATE INDEX "account_updated_at_idx" ON "accounts"("updated_at");

-- CreateIndex
CREATE INDEX "account_deleted_at_idx" ON "accounts"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_token_token_idx" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_expires_idx" ON "password_reset_tokens"("expires");

-- CreateIndex
CREATE INDEX "password_reset_created_at_idx" ON "password_reset_tokens"("created_at");

-- CreateIndex
CREATE INDEX "setting_key_idx" ON "settings"("key");

-- CreateIndex
CREATE INDEX "setting_group_name_idx" ON "settings"("group_name");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_group_name_key" ON "settings"("key", "group_name");

-- CreateIndex
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_system_logs_level" ON "system_logs"("level");

-- CreateIndex
CREATE INDEX "idx_system_logs_service" ON "system_logs"("service");

-- CreateIndex
CREATE INDEX "idx_system_logs_created_at" ON "system_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_system_logs_user_id" ON "system_logs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_logs_id_created_at_key" ON "system_logs"("id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
