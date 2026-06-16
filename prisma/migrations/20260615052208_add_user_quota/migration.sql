-- AlterTable
ALTER TABLE "users" ADD COLUMN     "quota_bytes" BIGINT,
ADD COLUMN     "quota_requests" BIGINT,
ADD COLUMN     "quota_updated_at" TIMESTAMPTZ,
ADD COLUMN     "used_bytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "used_requests" BIGINT NOT NULL DEFAULT 0;
