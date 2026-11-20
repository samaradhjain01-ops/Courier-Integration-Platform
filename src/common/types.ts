export type NormalizedOrder = {
  orderId: string;
  courierPartner: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  pickup: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  delivery: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  package: {
    weightKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    description?: string;
  };
  paymentMode: "PREPAID" | "COD";
  codAmount?: number;
};

export type ShipmentResult = {
  courierOrderId: string;
  awb: string;
  status: ShipmentStatusValue;
  raw: unknown;
};

export type ShipmentStatusValue =
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED"
  | "UNKNOWN";

export type TrackingResult = {
  awb: string;
  status: ShipmentStatusValue;
  description?: string;
  eventTime: Date;
  raw: unknown;
};
