import { prisma } from "../config/database";
import { NormalizedOrder } from "../common/types";

export async function enqueueBatch(orders: NormalizedOrder[]) {
  return prisma.$transaction(async tx => {
    const batch = await tx.bulkBatch.create({ data: { total: orders.length } });
    await tx.bulkBatchItem.createMany({
      data: orders.map(order => ({
        batchId: batch.id,
        orderId: order.orderId,
        payload: JSON.stringify(order),
        status: "PENDING"
      }))
    });
    return batch;
  });
}
