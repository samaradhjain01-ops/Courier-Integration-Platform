import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { env } from "../../config/env";
import { AppError } from "../../common/errors";
import { NormalizedOrder, ShipmentResult, TrackingResult, ShipmentStatusValue } from "../../common/types";
import { CourierAdapter } from "../courier.interface";

export class UrbaneBoltAdapter implements CourierAdapter {
  private readonly client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({ baseURL: env.URBANEBOLT_BASE_URL, timeout: env.URBANEBOLT_TIMEOUT_MS });
  }

  async authenticate(): Promise<void> {
    if (!env.URBANEBOLT_USERNAME || !env.URBANEBOLT_PASSWORD || !env.URBANEBOLT_CUSTOMER_CODE) {
      throw new AppError("COURIER_NOT_CONFIGURED", "UrbaneBolt credentials/customer code are not configured", 503);
    }
    try {
      const response = await this.client.post("/api/v1/auth/getToken/", {
        username: env.URBANEBOLT_USERNAME,
        password: env.URBANEBOLT_PASSWORD
      });
      this.token = response.data?.token ?? response.data?.access_token ?? response.data?.data?.token ?? null;
      if (!this.token) throw new Error("Token missing in authentication response");
    } catch (error: any) {
      this.token = null;
      throw new AppError("COURIER_AUTH_FAILED", "Unable to authenticate with UrbaneBolt", 502, undefined, error?.response?.data);
    }
  }

  private async request<T>(method: "get" | "post", url: string, data?: unknown): Promise<T> {
    if (!this.token) await this.authenticate();
    const config: AxiosRequestConfig = { method, url, data, headers: { Authorization: `Bearer ${this.token}` } };
    let authRetried = false;
    let transientAttempt = 0;

    while (true) {
      try {
        const response = await this.client.request<T>(config);
        return response.data;
      } catch (caught) {
        const error = caught as AxiosError;
        if (error.response?.status === 401 && !authRetried) {
          authRetried = true;
          this.token = null;
          await this.authenticate();
          config.headers = { ...config.headers, Authorization: `Bearer ${this.token}` };
          continue;
        }
        const status = error.response?.status;
        if (status && status >= 400 && status < 500) {
          throw new AppError("COURIER_REQUEST_REJECTED", "Courier rejected the shipment operation", 422, { partnerStatus: status }, error.response?.data);
        }
        if (transientAttempt < env.URBANEBOLT_RETRY_COUNT) {
          const delay = env.RETRY_BASE_DELAY_MS * (2 ** transientAttempt);
          transientAttempt += 1;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new AppError("COURIER_UNAVAILABLE", "Courier service is temporarily unavailable", 503, undefined, error.response?.data);
      }
    }
  }

  async createShipment(order: NormalizedOrder, outboundPayload: unknown = this.buildCreatePayload(order)): Promise<ShipmentResult> {
    const raw: any = await this.request("post", "/api/v1/services/manifest/", outboundPayload);
    const shipment = this.firstObject(raw);
    const awb = this.firstString(shipment, ["awb", "awb_number", "awbNumber", "awbNo", "awb_no", "waybill", "waybillNo", "tracking_number", "trackingNumber"]);
    const courierOrderId = this.firstString(shipment, ["order_id", "orderId", "shipment_id", "shipmentId", "shipmentReference", "id"]) ?? awb;
    if (!awb || !courierOrderId) {
      throw new AppError("COURIER_INVALID_RESPONSE", "UrbaneBolt response did not contain an AWB", 502, undefined, raw);
    }
    return { courierOrderId, awb, status: "CREATED", raw };
  }

  async trackShipment(awb: string): Promise<TrackingResult> {
    const raw: any = await this.request("get", `/api/v1/services/tracking-pub/?awb=${encodeURIComponent(awb)}`);
    const data = this.firstObject(raw);
    const events = Array.isArray(data?.travel_history) ? data.travel_history : Array.isArray(data?.history) ? data.history : [];
    const latest = events.length ? events[events.length - 1] : data;
    const statusText = latest?.status ?? latest?.current_status ?? data?.status ?? data?.current_status ?? data?.shipment_status;
    const dateValue = latest?.updated_at ?? latest?.event_time ?? data?.updated_at ?? data?.last_updated;
    return {
      awb,
      status: this.mapStatus(statusText),
      description: latest?.description ?? latest?.remarks ?? data?.description ?? data?.message,
      eventTime: dateValue && !Number.isNaN(Date.parse(dateValue)) ? new Date(dateValue) : new Date(),
      raw
    };
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean; raw: unknown }> {
    const raw = await this.request("post", "/api/v1/services/cancel/", { awbs: awb });
    const body: any = raw;
    return { cancelled: body?.success !== false && body?.status !== "FAILED" && body?.status !== "ERROR", raw };
  }

  buildCreatePayload(order: NormalizedOrder): unknown {
    const today = new Date().toISOString().slice(0, 10);
    return [{
      customerCode: env.URBANEBOLT_CUSTOMER_CODE,
      orderNumber: order.orderId,
      declaredValue: order.package.declaredValue ?? 100,
      itemDescription: order.package.description || "Goods",
      collectableValue: order.paymentMode === "COD" ? (order.codAmount ?? 0) : 0,
      height: order.package.heightCm ?? 1,
      length: order.package.lengthCm ?? 1,
      breadth: order.package.widthCm ?? 1,
      weight: order.package.weightKg,
      pieces: order.package.pieces ?? 1,
      itemQuantity: order.package.itemQuantity ?? 1,
      serviceType: env.URBANEBOLT_SERVICE_TYPE,
      payMode: order.paymentMode === "COD" ? "COD" : "PPD",
      invoiceNumber: order.invoiceNumber || order.orderId,
      invoiceDate: order.invoiceDate || today,
      consName: order.delivery.name,
      consAddress: order.delivery.address,
      consAddressType: "Home",
      consCity: order.delivery.city,
      consState: order.delivery.state,
      consPincode: Number(order.delivery.pincode),
      consCountry: "INDIA",
      consMobile: Number(order.delivery.phone),
      consEmail: order.customer.email || "",
      shprName: order.pickup.name,
      shprAddress: order.pickup.address,
      shprAddressType: "Seller",
      shprCity: order.pickup.city,
      shprState: order.pickup.state,
      shprPincode: Number(order.pickup.pincode),
      shprMobile: Number(order.pickup.phone),
      rtnName: order.pickup.name,
      rtnAddress: order.pickup.address,
      rtnAddressType: "Seller",
      rtnCity: order.pickup.city,
      rtnState: order.pickup.state,
      rtnPincode: Number(order.pickup.pincode),
      rtnMobile: Number(order.pickup.phone)
    }];
  }

  private firstObject(raw: any): any {
    let value = raw?.data ?? raw;
    if (Array.isArray(value)) value = value[0];
    return value ?? {};
  }

  private firstString(value: any, keys: string[]): string | undefined {
    for (const key of keys) {
      const candidate = value?.[key] ?? value?.data?.[key];
      if (candidate !== undefined && candidate !== null && String(candidate).length) return String(candidate);
    }
    return undefined;
  }

  private mapStatus(value: unknown): ShipmentStatusValue {
    const status = String(value ?? "").toUpperCase().replace(/[ -]/g, "_");
    if (status.includes("OUT_FOR_DELIVERY")) return "OUT_FOR_DELIVERY";
    if (status.includes("DELIVER")) return "DELIVERED";
    if (status.includes("CANCEL")) return "CANCELLED";
    if (status.includes("PICK")) return "PICKED_UP";
    if (status.includes("TRANSIT")) return "IN_TRANSIT";
    if (status.includes("FAIL") || status.includes("RTO")) return "FAILED";
    return "UNKNOWN";
  }
}
