-- Drop quota columns from users (dipindah ke tabel user_quotas)
ALTER TABLE "users" DROP COLUMN IF EXISTS "quota_bytes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "quota_requests";
ALTER TABLE "users" DROP COLUMN IF EXISTS "used_bytes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "used_requests";
ALTER TABLE "users" DROP COLUMN IF EXISTS "quota_updated_at";

-- CreateTable
CREATE TABLE "user_quotas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "quota_bytes" BIGINT,
    "quota_requests" BIGINT,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "used_requests" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_quotas_user_id_key" ON "user_quotas"("user_id");

-- AddForeignKey
ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
