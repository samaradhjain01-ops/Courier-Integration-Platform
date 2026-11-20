import { prisma } from "../config/database";
import { NormalizedOrder } from "../common/types";

export async function enqueueBatch(orders: NormalizedOrder[]) {
  return prisma.$transaction(async tx => {
    const batch = await tx.bulkBatch.create({ data: { total: orders.length } });
    for (const order of orders) {
      await tx.bulkBatchItem.create({
        data: {
          batchId: batch.id,
          orderId: order.orderId,
          payload: JSON.stringify(order),
          status: "PENDING"
        }
      });
    }
    return batch;
  });
}
