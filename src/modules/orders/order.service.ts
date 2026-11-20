import { prisma } from "../../config/database";
import { AppError } from "../../common/errors";
import { NormalizedOrder } from "../../common/types";
import { getCourier } from "../../couriers/courier.registry";

export class OrderService {
  async create(order: NormalizedOrder) {
    const existing = await prisma.order.findUnique({ where: { orderId: order.orderId } });
    if (existing) {
      throw new AppError("DUPLICATE_ORDER", "An order with this orderId already exists", 409);
    }

    const adapter = getCourier(order.courierPartner);
    const record = await prisma.order.create({
      data: {
        orderId: order.orderId,
        courierPartner: order.courierPartner,
        requestPayload: JSON.stringify(order),
        status: "CREATED"
      }
    });

    try {
      const result = await adapter.createShipment(order);
      return await prisma.order.update({
        where: { id: record.id },
        data: {
          courierOrderId: result.courierOrderId,
          awb: result.awb,
          status: result.status,
          responsePayload: JSON.stringify(result.raw),
          trackingHistory: {
            create: {
              status: result.status,
              rawPayload: JSON.stringify(result.raw)
            }
          }
        }
      });
    } catch (error: any) {
      await prisma.order.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          lastErrorCode: error.code ?? "SHIPMENT_CREATE_FAILED",
          lastErrorMessage: error.message ?? "Shipment creation failed",
          responsePayload: JSON.stringify({ error: error.code ?? "SHIPMENT_CREATE_FAILED" })
        }
      });
      throw error;
    }
  }

  async track(orderId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError("ORDER_NOT_FOUND", "Order was not found", 404);
    if (!order.awb) throw new AppError("TRACKING_NOT_AVAILABLE", "Shipment does not have an AWB yet", 409);

    const result = await getCourier(order.courierPartner).trackShipment(order.awb);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: result.status,
        trackingHistory: {
          create: {
            status: result.status,
            eventTime: result.eventTime,
            rawPayload: JSON.stringify(result.raw)
          }
        }
      }
    });

    return { order: updated, tracking: result };
  }

  async cancel(orderId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new AppError("ORDER_NOT_FOUND", "Order was not found", 404);
    if (!order.courierOrderId) throw new AppError("CANCELLATION_NOT_AVAILABLE", "Courier shipment reference is missing", 409);

    const result = await getCourier(order.courierPartner).cancelShipment(order.courierOrderId);
    if (!result.cancelled) throw new AppError("CANCELLATION_FAILED", "Courier could not cancel this shipment", 422);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        trackingHistory: {
          create: {
            status: "CANCELLED",
            rawPayload: JSON.stringify(result.raw)
          }
        }
      }
    });
    return updated;
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
