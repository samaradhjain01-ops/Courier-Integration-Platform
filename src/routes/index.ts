import { Router, Request, Response } from "express";
import { createOrder, trackOrder, cancelOrder, getOrder, createBulkOrders, getBatch } from "../controllers/order.controller";
import { supportedCouriers } from "../couriers/courier.registry";

const router = Router();
router.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));
router.get("/couriers", (_req, res) => res.json({ success: true, data: supportedCouriers() }));
router.post("/orders", createOrder);
router.post("/orders/bulk", createBulkOrders);
router.get("/orders/:orderId", getOrder);
router.get("/orders/:orderId/track", trackOrder);
router.post("/orders/:orderId/cancel", cancelOrder);
router.get("/batches/:batchId", getBatch);
router.use((_req: Request, res: Response) => res.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "API route was not found", details: null }, requestId: res.locals.requestId ?? null }));
export default router;
