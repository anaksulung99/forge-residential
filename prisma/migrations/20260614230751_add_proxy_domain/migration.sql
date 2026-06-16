-- CreateEnum
CREATE TYPE "ProxyProtocol" AS ENUM ('http', 'https', 'socks5');

-- CreateEnum
CREATE TYPE "ProxyCategory" AS ENUM ('RESIDENTIAL_ROTATING', 'MOBILE_ROTATING');

-- CreateEnum
CREATE TYPE "ProxyStatus" AS ENUM ('pending', 'checking', 'active', 'dead', 'banned');

-- CreateEnum
CREATE TYPE "AnonymityLevel" AS ENUM ('transparent', 'anonymous', 'elite', 'unknown');

-- CreateEnum
CREATE TYPE "RotationMode" AS ENUM ('per_request', 'sticky');

-- CreateEnum
CREATE TYPE "ProxySourceType" AS ENUM ('manual_import', 'file_import', 'scraper', 'api');

-- CreateTable
CREATE TABLE "proxy_sources" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "type" "ProxySourceType" NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "url" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "proxy_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" "ProxyProtocol" NOT NULL DEFAULT 'http',
    "username" VARCHAR(255),
    "password" VARCHAR(255),
    "category" "ProxyCategory" NOT NULL DEFAULT 'RESIDENTIAL_ROTATING',
    "is_mobile" BOOLEAN NOT NULL DEFAULT false,
    "country" VARCHAR(2),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "asn" INTEGER,
    "asn_org" VARCHAR(255),
    "usage_type" VARCHAR(20),
    "classification_source" VARCHAR(30),
    "anonymity" "AnonymityLevel" NOT NULL DEFAULT 'unknown',
    "status" "ProxyStatus" NOT NULL DEFAULT 'pending',
    "latency_ms" INTEGER,
    "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uptime_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMPTZ,
    "last_ok_at" TIMESTAMPTZ,
    "user_id" UUID NOT NULL,
    "source_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "proxies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_pools" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(150) NOT NULL,
    "category" "ProxyCategory" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "rotation_mode" "RotationMode" NOT NULL DEFAULT 'per_request',
    "sticky_ttl_sec" INTEGER,
    "gateway_username" VARCHAR(64) NOT NULL,
    "gateway_password" VARCHAR(255) NOT NULL,
    "filter_country" VARCHAR(2),
    "filter_protocol" "ProxyProtocol",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "proxy_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_pool_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pool_id" UUID NOT NULL,
    "proxy_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxy_pool_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_checks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "proxy_id" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "latency_ms" INTEGER,
    "exit_ip" VARCHAR(45),
    "exit_country" VARCHAR(2),
    "anonymity" "AnonymityLevel" NOT NULL DEFAULT 'unknown',
    "error" TEXT,
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxy_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "source" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "filters" JSONB,
    "found" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_request_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pool_id" UUID NOT NULL,
    "proxy_id" UUID,
    "user_id" UUID NOT NULL,
    "client_ip" VARCHAR(45),
    "target_host" VARCHAR(255),
    "status_code" INTEGER,
    "bytes_in" BIGINT NOT NULL DEFAULT 0,
    "bytes_out" BIGINT NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_proxy_sources_user_id" ON "proxy_sources"("user_id");

-- CreateIndex
CREATE INDEX "idx_proxy_sources_type" ON "proxy_sources"("type");

-- CreateIndex
CREATE INDEX "idx_proxies_user_id" ON "proxies"("user_id");

-- CreateIndex
CREATE INDEX "idx_proxies_status" ON "proxies"("status");

-- CreateIndex
CREATE INDEX "idx_proxies_category" ON "proxies"("category");

-- CreateIndex
CREATE INDEX "idx_proxies_country" ON "proxies"("country");

-- CreateIndex
CREATE INDEX "idx_proxies_is_mobile" ON "proxies"("is_mobile");

-- CreateIndex
CREATE INDEX "idx_proxies_source_id" ON "proxies"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "proxies_host_port_protocol_user_id_key" ON "proxies"("host", "port", "protocol", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "proxy_pools_gateway_username_key" ON "proxy_pools"("gateway_username");

-- CreateIndex
CREATE INDEX "idx_proxy_pools_user_id" ON "proxy_pools"("user_id");

-- CreateIndex
CREATE INDEX "idx_proxy_pools_category" ON "proxy_pools"("category");

-- CreateIndex
CREATE UNIQUE INDEX "proxy_pools_user_id_name_key" ON "proxy_pools"("user_id", "name");

-- CreateIndex
CREATE INDEX "idx_pool_members_pool_id" ON "proxy_pool_members"("pool_id");

-- CreateIndex
CREATE INDEX "idx_pool_members_proxy_id" ON "proxy_pool_members"("proxy_id");

-- CreateIndex
CREATE UNIQUE INDEX "proxy_pool_members_pool_id_proxy_id_key" ON "proxy_pool_members"("pool_id", "proxy_id");

-- CreateIndex
CREATE INDEX "idx_proxy_checks_proxy_id" ON "proxy_checks"("proxy_id");

-- CreateIndex
CREATE INDEX "idx_proxy_checks_checked_at" ON "proxy_checks"("checked_at");

-- CreateIndex
CREATE INDEX "idx_scrape_jobs_user_id" ON "scrape_jobs"("user_id");

-- CreateIndex
CREATE INDEX "idx_scrape_jobs_status" ON "scrape_jobs"("status");

-- CreateIndex
CREATE INDEX "idx_gateway_logs_user_created" ON "gateway_request_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_gateway_logs_pool_created" ON "gateway_request_logs"("pool_id", "created_at");

-- AddForeignKey
ALTER TABLE "proxy_sources" ADD CONSTRAINT "proxy_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxies" ADD CONSTRAINT "proxies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxies" ADD CONSTRAINT "proxies_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "proxy_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_pools" ADD CONSTRAINT "proxy_pools_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_pool_members" ADD CONSTRAINT "proxy_pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "proxy_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_pool_members" ADD CONSTRAINT "proxy_pool_members_proxy_id_fkey" FOREIGN KEY ("proxy_id") REFERENCES "proxies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_checks" ADD CONSTRAINT "proxy_checks_proxy_id_fkey" FOREIGN KEY ("proxy_id") REFERENCES "proxies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
