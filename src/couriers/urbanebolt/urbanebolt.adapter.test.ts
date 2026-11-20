import { UrbaneBoltAdapter } from "./urbanebolt.adapter";
import { NormalizedOrder } from "../../common/types";

const order: NormalizedOrder = {
  orderId: "UB-TEST-1",
  courierPartner: "urbanebolt",
  customer: { name: "Buyer", phone: "9876501234", email: "buyer@example.com" },
  pickup: { name: "Seller", phone: "9876543210", address: "Pickup Road", city: "Indore", state: "Madhya Pradesh", pincode: "452001" },
  delivery: { name: "Buyer", phone: "9876501234", address: "Delivery Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  package: { weightKg: 1.5, lengthCm: 10, widthCm: 12, heightCm: 8, description: "Books", declaredValue: 500 },
  paymentMode: "COD",
  codAmount: 500
};

describe("UrbaneBoltAdapter", () => {
  it("maps the normalized order to the documented manifest array contract", () => {
    const adapter = new UrbaneBoltAdapter();
    const payload = adapter.buildCreatePayload(order) as any[];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      orderNumber: "UB-TEST-1",
      payMode: "COD",
      collectableValue: 500,
      consName: "Buyer",
      shprName: "Seller",
      weight: 1.5
    });
  });
});
