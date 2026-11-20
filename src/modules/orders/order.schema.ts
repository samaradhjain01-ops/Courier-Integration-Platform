import { z } from "zod";

const addressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(4)
});

export const orderSchema = z.object({
  orderId: z.string().min(1),
  courierPartner: z.string().min(1).transform(value => value.toLowerCase()),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(8),
    email: z.string().email().optional()
  }),
  pickup: addressSchema,
  delivery: addressSchema,
  package: z.object({
    weightKg: z.number().positive(),
    lengthCm: z.number().positive().optional(),
    widthCm: z.number().positive().optional(),
    heightCm: z.number().positive().optional(),
    description: z.string().optional()
  }),
  paymentMode: z.enum(["PREPAID", "COD"]),
  codAmount: z.number().nonnegative().optional()
}).refine(value => value.paymentMode !== "COD" || value.codAmount !== undefined, {
  message: "codAmount is required for COD orders",
  path: ["codAmount"]
});

export const bulkOrderSchema = z.object({
  orders: z.array(orderSchema).min(1).max(100)
});
