import { MockCourierAdapter } from "./mock.adapter";

describe("MockCourierAdapter", () => {
  it("creates a shipment with a tracking number", async () => {
    const adapter = new MockCourierAdapter();
    await adapter.authenticate();

    const result = await adapter.createShipment({
      orderId: "TEST-1",
      courierPartner: "mock",
      customer: { name: "Test", phone: "9876543210" },
      pickup: {
        name: "Pickup",
        phone: "9876543210",
        address: "Address",
        city: "Indore",
        state: "MP",
        pincode: "452001"
      },
      delivery: {
        name: "Delivery",
        phone: "9876501234",
        address: "Address",
        city: "Indore",
        state: "MP",
        pincode: "452010"
      },
      package: { weightKg: 1 },
      paymentMode: "PREPAID"
    });

    expect(result.awb).toMatch(/^MOCK/);
    expect(result.status).toBe("CREATED");
  });
});
