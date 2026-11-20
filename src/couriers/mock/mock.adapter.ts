import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { AppError } from "../../common/errors";
import { NormalizedOrder, ShipmentResult, TrackingResult } from "../../common/types";
import { CourierAdapter } from "../courier.interface";

export class MockCourierAdapter implements CourierAdapter {
  private authenticated = false;

  async authenticate(): Promise<void> {
    if (!env.MOCK_COURIER_USERNAME || !env.MOCK_COURIER_PASSWORD) {
      throw new AppError("COURIER_AUTH_FAILED", "Mock courier credentials are not configured", 502);
    }
    this.authenticated = true;
  }

  buildCreatePayload(order: NormalizedOrder): unknown {
    return { reference: order.orderId, deliveryPincode: order.delivery.pincode, weightKg: order.package.weightKg };
  }

  async createShipment(order: NormalizedOrder, _outboundPayload: unknown = this.buildCreatePayload(order)): Promise<ShipmentResult> {
    if (!this.authenticated) await this.authenticate();

    const raw = {
      reference: order.orderId,
      shipment_reference: randomUUID(),
      tracking_number: `MOCK${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`
    };

    return {
      courierOrderId: String(raw.shipment_reference),
      awb: raw.tracking_number,
      status: "CREATED",
      raw
    };
  }

  async trackShipment(awb: string): Promise<TrackingResult> {
    if (!this.authenticated) await this.authenticate();

    const raw = { tracking_number: awb, status: "IN_TRANSIT" };
    return {
      awb,
      status: "IN_TRANSIT",
      description: "Shipment is moving through the mock network",
      eventTime: new Date(),
      raw
    };
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean; raw: unknown }> {
    if (!this.authenticated) await this.authenticate();
    return { cancelled: true, raw: { awb, status: "CANCELLED" } };
  }
}
