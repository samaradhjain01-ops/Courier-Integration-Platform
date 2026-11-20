import { AppError } from "../common/errors";
import { CourierAdapter } from "./courier.interface";
import { MockCourierAdapter } from "./mock/mock.adapter";
import { UrbaneBoltAdapter } from "./urbanebolt/urbanebolt.adapter";

const adapters: Record<string, CourierAdapter> = {
  mock: new MockCourierAdapter(),
  urbanebolt: new UrbaneBoltAdapter()
};

export function getCourier(partner: string): CourierAdapter {
  const adapter = adapters[partner.toLowerCase()];
  if (!adapter) {
    throw new AppError(
      "UNKNOWN_COURIER",
      "Unsupported courier partner",
      400,
      { supportedCouriers: Object.keys(adapters) }
    );
  }
  return adapter;
}

export function supportedCouriers(): string[] {
  return Object.keys(adapters);
}
