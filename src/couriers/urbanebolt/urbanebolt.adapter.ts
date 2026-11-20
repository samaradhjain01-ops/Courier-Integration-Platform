import axios, { AxiosInstance } from "axios";
import { env } from "../../config/env";
import { AppError } from "../../common/errors";
import { NormalizedOrder, ShipmentResult, TrackingResult, ShipmentStatusValue } from "../../common/types";
import { CourierAdapter } from "../courier.interface";

export class UrbaneBoltAdapter implements CourierAdapter {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: env.URBANEBOLT_BASE_URL,
      timeout: env.URBANEBOLT_TIMEOUT_MS
    });
  }

  async authenticate(): Promise<void> {
    if (!env.URBANEBOLT_USERNAME || !env.URBANEBOLT_PASSWORD) {
      throw new AppError("COURIER_NOT_CONFIGURED", "UrbaneBolt credentials are not configured", 503);
    }

    try {
      const response = await this.client.post("/api/v1/auth/getToken/", {
        username: env.URBANEBOLT_USERNAME,
        password: env.URBANEBOLT_PASSWORD
      });
      this.token = response.data?.token ?? response.data?.access_token ?? null;
      if (!this.token) throw new Error("Authentication response did not contain a token");
    } catch {
      throw new AppError("COURIER_AUTH_FAILED", "Unable to authenticate with courier", 502);
    }
  }

  private async request<T>(method: "get" | "post", url: string, data?: unknown): Promise<T> {
    if (!this.token) await this.authenticate();

    try {
      const response = await this.client.request<T>({
        method,
        url,
        data,
        headers: { Authorization: `Bearer ${this.token}` }
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.token = null;
        await this.authenticate();
        try {
          const response = await this.client.request<T>({
            method,
            url,
            data,
            headers: { Authorization: `Bearer ${this.token}` }
          });
          return response.data;
        } catch {
          throw new AppError("COURIER_REQUEST_FAILED", "Courier rejected the request after re-authentication", 502);
        }
      }
      const status = error.response?.status;
      if (status && status < 500) {
        throw new AppError("COURIER_VALIDATION_FAILED", "Courier could not accept the shipment request", 422);
      }
      throw new AppError("COURIER_UNAVAILABLE", "Courier service is temporarily unavailable", 503);
    }
  }

  async createShipment(order: NormalizedOrder): Promise<ShipmentResult> {
    const payload = this.mapCreatePayload(order);
    const raw: any = await this.request("post", "/api/v1/services/manifest/", payload);
    const shipment = raw?.data?.[0] ?? raw?.data ?? raw;
    const awb = shipment?.awb ?? shipment?.awb_number ?? shipment?.tracking_number;
    const courierOrderId = shipment?.order_id ?? shipment?.shipment_id ?? awb;

    if (!awb || !courierOrderId) {
      throw new AppError("COURIER_INVALID_RESPONSE", "Courier response did not contain shipment identifiers", 502);
    }

    return {
      courierOrderId: String(courierOrderId),
      awb: String(awb),
      status: "CREATED",
      raw
    };
  }

  async trackShipment(awb: string): Promise<TrackingResult> {
    const raw: any = await this.request(
      "get",
      `/api/v1/services/tracking-pub/?awb=${encodeURIComponent(awb)}`
    );
    const data = raw?.data ?? raw;
    return {
      awb,
      status: this.mapStatus(data?.status ?? data?.current_status),
      description: data?.description ?? data?.message,
      eventTime: new Date(data?.updated_at ?? Date.now()),
      raw
    };
  }

  async cancelShipment(courierOrderId: string): Promise<{ cancelled: boolean; raw: unknown }> {
    const raw = await this.request("post", "/api/v1/services/cancel/", {
      order_id: courierOrderId
    });
    return { cancelled: true, raw };
  }

  private mapCreatePayload(order: NormalizedOrder): unknown {
    return {
      reference_number: order.orderId,
      consignee_name: order.delivery.name,
      consignee_phone: order.delivery.phone,
      consignee_address: order.delivery.address,
      consignee_city: order.delivery.city,
      consignee_state: order.delivery.state,
      consignee_pincode: order.delivery.pincode,
      pickup_name: order.pickup.name,
      pickup_phone: order.pickup.phone,
      pickup_address: order.pickup.address,
      pickup_city: order.pickup.city,
      pickup_state: order.pickup.state,
      pickup_pincode: order.pickup.pincode,
      weight: order.package.weightKg,
      payment_mode: order.paymentMode,
      cod_amount: order.codAmount ?? 0
    };
  }

  private mapStatus(value: string): ShipmentStatusValue {
    const status = String(value).toUpperCase();
    if (status.includes("DELIVER")) return "DELIVERED";
    if (status.includes("CANCEL")) return "CANCELLED";
    if (status.includes("PICK")) return "PICKED_UP";
    if (status.includes("OUT_FOR_DELIVERY")) return "OUT_FOR_DELIVERY";
    if (status.includes("TRANSIT")) return "IN_TRANSIT";
    if (status.includes("FAIL")) return "FAILED";
    return "UNKNOWN";
  }
}
