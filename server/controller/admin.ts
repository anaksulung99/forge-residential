import type { H3Event } from "h3";

interface BulkDeleteOptions {
  sessionIds?: string[];
  userIds?: string[];
  olderThanDays?: number;
  status?: string[];
  batchSize?: number;
}
interface BatchDetail {
  batch: number;
  ids: string[];
  count: number;
  timestamp: string;
}

export const cleanUpAllLogsHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);
    await prisma.$transaction(async (tx) => {
      await tx.systemLog.deleteMany();
      await tx.auditLog.deleteMany();
    });
    return { success: true, message: "Logs cleaned up successfully" };
  } catch (err) {
    throw handleRequestError(err);
  }
};
export const cleanUpProxiesHandler = async (event: H3Event) => {
  try {
    await requireAdmin(event);
    await prisma.$transaction(async (tx) => {
      await tx.proxy.deleteMany({
        where: {
          status: "dead",
        },
      });
    });

    return { success: true, message: "Proxies cleaned up successfully" };
  } catch (err) {
    throw handleRequestError(err);
  }
};
