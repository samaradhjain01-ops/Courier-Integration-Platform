import { NormalizedOrder, ShipmentResult, TrackingResult } from "../common/types";

export interface CourierAdapter {
  authenticate(): Promise<void>;
  buildCreatePayload(order: NormalizedOrder): unknown;
  createShipment(order: NormalizedOrder, outboundPayload: unknown): Promise<ShipmentResult>;
  trackShipment(awb: string): Promise<TrackingResult>;
  cancelShipment(awb: string): Promise<{ cancelled: boolean; raw: unknown }>;
}
