import { NormalizedOrder, ShipmentResult, TrackingResult } from "../common/types";

export interface CourierAdapter {
  authenticate(): Promise<void>;
  createShipment(order: NormalizedOrder): Promise<ShipmentResult>;
  trackShipment(awb: string): Promise<TrackingResult>;
  cancelShipment(courierOrderId: string): Promise<{ cancelled: boolean; raw: unknown }>;
}
