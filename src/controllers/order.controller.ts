import { Request, Response, NextFunction } from "express";
import { OrderService } from "../modules/orders/order.service";
import { orderSchema, bulkOrderSchema } from "../modules/orders/order.schema";
import { enqueueBatch } from "../jobs/bulk-queue";
import { prisma } from "../config/database";

const service = new OrderService();

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = orderSchema.parse(req.body);
    const result = await service.create(order);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function trackOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.track(req.params.orderId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.cancel(req.params.orderId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.get(req.params.orderId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createBulkOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const body = bulkOrderSchema.parse(req.body);
    const seen = new Set<string>();
    const duplicates = body.orders.filter(order => {
      if (seen.has(order.orderId)) return true;
      seen.add(order.orderId);
      return false;
    });
    if (duplicates.length) {
      return res.status(400).json({
        success: false,
        error: {
          code: "DUPLICATE_ORDER_IDS_IN_BATCH",
          message: "The same orderId cannot appear more than once in a batch",
          details: duplicates.map(order => order.orderId)
        }
      });
    }

    const batch = await prisma.bulkBatch.create({ data: { total: body.orders.length } });
    await prisma.bulkBatchItem.createMany({
      data: body.orders.map(order => ({
        batchId: batch.id,
        orderId: order.orderId,
        payload: JSON.stringify(order)
      })) as any
    });

    res.status(202).json({
      success: true,
      data: {
        batchId: batch.id,
        total: body.orders.length,
        status: "ACCEPTED",
        statusUrl: `/api/v1/batches/${batch.id}`
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await prisma.bulkBatch.findUnique({
      where: { id: req.params.batchId },
      include: { items: true }
    });
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: "BATCH_NOT_FOUND", message: "Batch was not found", details: null }
      });
    }
    const counts = {
      pending: batch.items.filter(item => item.status === "PENDING").length,
      processing: batch.items.filter(item => item.status === "PROCESSING").length,
      completed: batch.items.filter(item => item.status === "COMPLETED").length,
      failed: batch.items.filter(item => item.status === "FAILED").length
    };
    res.json({ success: true, data: { ...batch, counts } });
  } catch (error) {
    next(error);
  }
}
