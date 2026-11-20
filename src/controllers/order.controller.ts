import { Request, Response, NextFunction } from "express";
import { OrderService } from "../modules/orders/order.service";
import { orderSchema, bulkOrderSchema } from "../modules/orders/order.schema";
import { enqueueBatch } from "../jobs/bulk-queue";
import { prisma } from "../config/database";

const service = new OrderService();
const requestId = (req: Request) => (req as any).requestId ?? req.header("x-request-id") ?? "unknown";

function orderDto(order: any) {
  return {
    id: order.id,
    order_id: order.orderId,
    courier_partner: order.courierPartner,
    courier_order_id: order.courierOrderId,
    awb: order.awb,
    status: order.status,
    last_error_code: order.lastErrorCode,
    last_error_message: order.lastErrorMessage,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    tracking_history: order.trackingHistory?.map((event: any) => ({ status: event.status, event_time: event.eventTime }))
  };
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = orderSchema.parse(req.body);
    const result = await service.create(order, requestId(req));
    res.status(201).json({ success: true, data: orderDto(result) });
  } catch (error) { next(error); }
}

export async function trackOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.track(req.params.orderId, requestId(req));
    res.json({ success: true, data: {
      order: orderDto(result.order),
      tracking: { awb: result.tracking.awb, status: result.tracking.status, description: result.tracking.description, event_time: result.tracking.eventTime }
    } });
  }
  catch (error) { next(error); }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: orderDto(await service.cancel(req.params.orderId, requestId(req))) }); }
  catch (error) { next(error); }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: orderDto(await service.get(req.params.orderId)) }); }
  catch (error) { next(error); }
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
          message: "Each order_id must be unique within a batch",
          details: { order_ids: duplicates.map(order => order.orderId) }
        },
        requestId: requestId(req)
      });
    }
    const batch = await enqueueBatch(body.orders);
    res.status(202).json({ success: true, data: {
      batchId: batch.id,
      total: body.orders.length,
      status: "ACCEPTED",
      status_url: `/api/v1/batches/${batch.id}`
    } });
  } catch (error) { next(error); }
}

export async function getBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await prisma.bulkBatch.findUnique({ where: { id: req.params.batchId }, include: { items: true } });
    if (!batch) return res.status(404).json({ success: false, error: { code: "BATCH_NOT_FOUND", message: "Batch was not found", details: null }, requestId: requestId(req) });
    const counts = {
      pending: batch.items.filter(item => item.status === "PENDING").length,
      processing: batch.items.filter(item => item.status === "PROCESSING").length,
      completed: batch.items.filter(item => item.status === "COMPLETED").length,
      failed: batch.items.filter(item => item.status === "FAILED").length
    };
    const orderRows = await prisma.order.findMany({ where: { orderId: { in: batch.items.map(item => item.orderId) } } });
    const ordersById = new Map(orderRows.map(order => [order.orderId, order]));
    const status = counts.pending + counts.processing > 0 ? "PROCESSING" : counts.failed > 0 ? (counts.completed > 0 ? "PARTIAL_SUCCESS" : "FAILED") : "COMPLETED";
    res.json({ success: true, data: { ...batch, status, counts, items: batch.items.map(item => {
      const order = ordersById.get(item.orderId);
      return { order_id: item.orderId, status: item.status, attempts: item.attempts, error: item.error,
        courier_partner: order?.courierPartner ?? null, awb: order?.awb ?? null, shipment_status: order?.status ?? null };
    }) } });
  } catch (error) { next(error); }
}
