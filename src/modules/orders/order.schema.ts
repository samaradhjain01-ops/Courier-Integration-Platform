import { z } from "zod";

const addressSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().regex(/^\+?\d{8,15}$/, "Phone must contain 8–15 digits"),
  address: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  pincode: z.string().trim().regex(/^\d{4,10}$/, "Pincode must contain 4–10 digits")
});

const normalizedOrderObject = z.object({
  orderId: z.string().trim().min(1).max(100),
  courierPartner: z.string().trim().min(1).transform(value => value.toLowerCase()),
  customer: z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().regex(/^\+?\d{8,15}$/, "Phone must contain 8–15 digits"),
    email: z.string().email().optional()
  }),
  pickup: addressSchema,
  delivery: addressSchema,
  package: z.object({
    weightKg: z.number().positive(),
    lengthCm: z.number().positive().optional(),
    widthCm: z.number().positive().optional(),
    heightCm: z.number().positive().optional(),
    description: z.string().trim().optional(),
    declaredValue: z.number().nonnegative().default(100),
    pieces: z.number().int().positive().default(1),
    itemQuantity: z.number().int().positive().default(1)
  }),
  paymentMode: z.enum(["PREPAID", "COD"]),
  codAmount: z.number().nonnegative().optional(),
  invoiceNumber: z.string().trim().optional(),
  invoiceDate: z.string().trim().optional()
}).strict().refine(value => value.paymentMode !== "COD" || value.codAmount !== undefined, {
  message: "codAmount is required for COD orders",
  path: ["codAmount"]
});

// Public API accepts the assignment's snake_case names and the original camelCase
// names for backwards compatibility. The adapter/service only sees one model.
export const orderSchema = z.preprocess((input: any) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const value = { ...input };
  value.orderId ??= value.order_id;
  value.courierPartner ??= value.courier_partner;
  delete value.order_id;
  delete value.courier_partner;
  return value;
}, normalizedOrderObject);

export const bulkOrderSchema = z.object({ orders: z.array(orderSchema).min(1).max(100) }).strict();
export type OrderInput = z.infer<typeof orderSchema>;
