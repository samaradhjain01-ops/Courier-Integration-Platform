import { prisma } from "../config/database";
import { env } from "../config/env";
import { logger } from "../common/logger";
import { OrderService } from "../modules/orders/order.service";
import { orderSchema } from "../modules/orders/order.schema";

const orderService = new OrderService();
let running = false;

export async function processPendingJobs(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const jobs = await prisma.bulkBatchItem.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5
    });

    await Promise.all(jobs.map(async job => {
      const claimed = await prisma.bulkBatchItem.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "PROCESSING", attempts: { increment: 1 } }
      });
      if (claimed.count === 0) return;

      try {
        const itemData = await prisma.bulkBatchItem.findUniqueOrThrow({ where: { id: job.id } });
        const batchOrders = await prisma.order.findMany({ where: { orderId: itemData.orderId } });

        if (batchOrders.length) {
          await prisma.bulkBatchItem.update({
            where: { id: job.id },
            data: { status: "COMPLETED", error: null }
          });
          return;
        }

        const storedPayload = await prisma.bulkBatchItem.findUnique({ where: { id: job.id } });
        const payload = (storedPayload as any)?.payload;
        if (!payload) {
          throw new Error("Order payload is missing from the job record");
        }
        const order = orderSchema.parse(JSON.parse(payload));
        await orderService.create(order);
        await prisma.bulkBatchItem.update({
          where: { id: job.id },
          data: { status: "COMPLETED", error: null }
        });
      } catch (error: any) {
        const attempts = job.attempts + 1;
        await prisma.bulkBatchItem.update({
          where: { id: job.id },
          data: {
            status: attempts < env.JOB_MAX_ATTEMPTS ? "PENDING" : "FAILED",
            error: error.message ?? "Order processing failed"
          }
        });
        logger.error({ orderId: job.orderId, error }, "Bulk order processing failed");
      }
    }));
  } finally {
    running = false;
  }
}

export function startBulkWorker(): NodeJS.Timeout {
  return setInterval(() => {
    void processPendingJobs();
  }, env.JOB_POLL_INTERVAL_MS);
}
