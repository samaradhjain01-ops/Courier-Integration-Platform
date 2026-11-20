import { orderSchema } from "./order.schema";

const validOrder = {
  order_id: "ORDER-TEST-1",
  courier_partner: "Mock",
  customer: { name: "Buyer", phone: "9876543210" },
  pickup: { name: "Warehouse", phone: "9876543210", address: "A Road", city: "Indore", state: "MP", pincode: "452001" },
  delivery: { name: "Buyer", phone: "9876501234", address: "B Road", city: "Indore", state: "MP", pincode: "452002" },
  package: { weightKg: 1 },
  paymentMode: "PREPAID"
};

describe("orderSchema", () => {
  it("accepts assignment snake_case identifiers and normalizes courier partner", () => {
    const parsed = orderSchema.parse(validOrder);
    expect(parsed.orderId).toBe("ORDER-TEST-1");
    expect(parsed.courierPartner).toBe("mock");
    expect(parsed.package.declaredValue).toBe(100);
  });

  it("continues to accept legacy camelCase identifiers", () => {
    const { order_id, courier_partner, ...rest } = validOrder;
    const parsed = orderSchema.parse({ ...rest, orderId: order_id, courierPartner: courier_partner });
    expect(parsed.orderId).toBe("ORDER-TEST-1");
  });

  it("requires codAmount for COD shipments", () => {
    expect(() => orderSchema.parse({ ...validOrder, paymentMode: "COD" })).toThrow();
  });
});
