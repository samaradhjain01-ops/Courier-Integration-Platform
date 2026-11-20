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
    const staleBefore = new Date(Date.now() - env.JOB_STALE_AFTER_MS);
    await prisma.bulkBatchItem.updateMany({
      where: { status: "PROCESSING", processingStartedAt: { lt: staleBefore } },
      data: { status: "PENDING", processingStartedAt: null }
    });
    const jobs = await prisma.bulkBatchItem.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: env.JOB_CONCURRENCY
    });

    await Promise.all(jobs.map(async job => {
      const claimed = await prisma.bulkBatchItem.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "PROCESSING", processingStartedAt: new Date(), attempts: { increment: 1 } }
      });
      if (claimed.count === 0) return;

      try {
        const order = orderSchema.parse(JSON.parse(job.payload));
        const existing = await prisma.order.findUnique({ where: { orderId: job.orderId } });
        if (existing) {
          const alreadyCreated = !["FAILED", "CREATING"].includes(existing.status);
          await prisma.bulkBatchItem.update({
            where: { id: job.id },
            data: {
              status: alreadyCreated ? "COMPLETED" : "FAILED",
              error: alreadyCreated ? null : `ORDER_NOT_REPLAYED: existing shipment is ${existing.status}`,
              processingStartedAt: null
            }
          });
          return;
        }
        await orderService.create(order, `batch:${job.batchId}`);
        await prisma.bulkBatchItem.update({
          where: { id: job.id },
          data: { status: "COMPLETED", error: null, processingStartedAt: null }
        });
      } catch (error: any) {
        await prisma.bulkBatchItem.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            processingStartedAt: null,
            error: error.message ?? "Order processing failed"
          }
        });
        logger.error({ order_id: job.orderId, courier_partner: (() => { try { return JSON.parse(job.payload).courierPartner; } catch { return "unknown"; } })(), request_id: `batch:${job.batchId}`, error_type: error.code ?? "BULK_PROCESSING_FAILED", err: error }, "Bulk order processing failed");
      }
    }));
  } catch (error) {
    logger.error({ err: error }, "Bulk worker iteration failed");
  } finally {
    running = false;
  }
}

export function startBulkWorker(): NodeJS.Timeout {
  void processPendingJobs();
  return setInterval(() => { void processPendingJobs(); }, env.JOB_POLL_INTERVAL_MS);
}
