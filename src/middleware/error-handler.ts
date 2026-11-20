import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../common/errors";
import { logger } from "../common/logger";

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = res.locals.requestId ?? (req as any).requestId ?? "unknown";
  if ((error as any)?.type === "entity.parse.failed") {
    logger.warn({ request_id: requestId, error_type: "INVALID_JSON", err: error }, "Malformed JSON request body");
    return res.status(400).json({ success: false, error: { code: "INVALID_JSON", message: "Request body must contain valid JSON", details: null }, requestId });
  }
  if (error instanceof ZodError) {
    const fields = error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message, code: issue.code }));
    logger.warn({ request_id: requestId, order_id: (req.body as any)?.orderId ?? (req.body as any)?.order_id, courier_partner: (req.body as any)?.courierPartner ?? (req.body as any)?.courier_partner, error_type: "VALIDATION_ERROR", fields }, "Request validation failed");
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: { fields } }, requestId });
  }
  if (error instanceof AppError) {
    logger.error({ request_id: requestId, order_id: (req.body as any)?.orderId ?? (req.body as any)?.order_id, courier_partner: (req.body as any)?.courierPartner ?? (req.body as any)?.courier_partner, error_type: error.code, err: error }, "Request failed");
    return res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message, details: error.details ?? null }, requestId });
  }
  logger.error({ request_id: requestId, order_id: (req.body as any)?.orderId ?? (req.body as any)?.order_id, courier_partner: (req.body as any)?.courierPartner ?? (req.body as any)?.courier_partner, error_type: "INTERNAL_SERVER_ERROR", err: error }, "Unhandled request error");
  return res.status(500).json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred", details: null }, requestId });
}
