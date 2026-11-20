import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../../common/errors";
import { logger } from "../../common/logger";
import { NormalizedOrder } from "../../common/types";
import { getCourier } from "../../couriers/courier.registry";

export class OrderService {
  async create(order: NormalizedOrder, requestId = "background") {
    const adapter = getCourier(order.courierPartner);
    const outboundRequest = adapter.buildCreatePayload(order);
    const existing = await prisma.order.findUnique({ where: { orderId: order.orderId } });
    if (existing) throw new AppError("DUPLICATE_ORDER", "An order with this order_id already exists", 409);

    let record;
    try {
      record = await prisma.order.create({
        data: {
          orderId: order.orderId,
          courierPartner: order.courierPartner,
          requestPayload: JSON.stringify(outboundRequest),
          normalizedRequestPayload: JSON.stringify(order),
          status: "CREATING"
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("DUPLICATE_ORDER", "An order with this order_id already exists", 409);
      }
      throw error;
    }

    try {
      const result = await adapter.createShipment(order, outboundRequest);
      return await prisma.order.update({
        where: { id: record.id },
        data: {
          courierOrderId: result.courierOrderId,
          awb: result.awb,
          status: result.status,
          responsePayload: JSON.stringify(result.raw),
          trackingHistory: { create: { status: result.status, rawPayload: JSON.stringify(result.raw) } }
        }
      });
    } catch (error: any) {
      const code = error?.code ?? "SHIPMENT_CREATE_FAILED";
      const message = error instanceof AppError ? error.message : "Shipment creation failed";
      await prisma.order.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          lastErrorCode: code,
          lastErrorMessage: message,
          responsePayload: JSON.stringify(error instanceof AppError && error.rawResponse !== undefined ? error.rawResponse : { code })
        }
      });
      logger.error({ order_id: order.orderId, courier_partner: order.courierPartner, request_id: requestId, error_type: code, err: error }, "Courier shipment creation failed");
      throw error;
    }
  }

  async track(orderId: string, requestId = "unknown") {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError("ORDER_NOT_FOUND", "Order was not found", 404);
    if (!order.awb) throw new AppError("TRACKING_NOT_AVAILABLE", "Shipment does not have an AWB yet", 409);
    try {
      const result = await getCourier(order.courierPartner).trackShipment(order.awb);
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: result.status,
          trackingHistory: { create: { status: result.status, eventTime: result.eventTime, rawPayload: JSON.stringify(result.raw) } }
        }
      });
      return { order: updated, tracking: result };
    } catch (error) {
      logger.error({ order_id: orderId, courier_partner: order.courierPartner, request_id: requestId, error_type: (error as any)?.code ?? "TRACKING_FAILED", err: error }, "Courier tracking failed");
      throw error;
    }
  }

  async cancel(orderId: string, requestId = "unknown") {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError("ORDER_NOT_FOUND", "Order was not found", 404);
    if (!order.awb) throw new AppError("CANCELLATION_NOT_AVAILABLE", "Shipment AWB is missing", 409);
    if (order.status === "CANCELLED") return order;
    try {
      const result = await getCourier(order.courierPartner).cancelShipment(order.awb);
      if (!result.cancelled) throw new AppError("CANCELLATION_FAILED", "Courier could not cancel this shipment", 422);
      return await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          trackingHistory: { create: { status: "CANCELLED", rawPayload: JSON.stringify(result.raw) } }
        }
      });
    } catch (error) {
      logger.error({ order_id: orderId, courier_partner: order.courierPartner, request_id: requestId, error_type: (error as any)?.code ?? "CANCELLATION_FAILED", err: error }, "Courier cancellation failed");
      throw error;
    }
  }

  async get(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { trackingHistory: { orderBy: { eventTime: "asc" } } }
    });
    if (!order) throw new AppError("ORDER_NOT_FOUND", "Order was not found", 404);
    return order;
  }
}
