import { FulfilmentStatus } from "@saleis-live/domain";
import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../store/auditLog.js";
import { getOrderById, listOrdersForBrand, updateOrder } from "../store/orders.js";
import { getBrandById } from "../store/tenants.js";

const NEXT_FULFILMENT: Record<FulfilmentStatus, { next: FulfilmentStatus; label: string } | null> = {
  not_started: { next: "ready_to_pack", label: "Marked ready to pack" },
  ready_to_pack: { next: "packed", label: "Packed" },
  packed: { next: "in_transit", label: "Shipped" },
  in_transit: { next: "delivered", label: "Delivered" },
  delivered: null,
};

/**
 * Screens 09-10 (Orders, Order Detail) — "manage payment and fulfilment
 * separately" per the mockup's own subtitle. Fulfilment here is the
 * merchant's own internal packing/shipping tracking, distinct from an
 * automated courier-API booking (that's the "Delivery" adapter in Launch
 * Studio, which stays honestly "not connected" — this doesn't pretend
 * otherwise).
 */
export function ordersRouter(): Router {
  const router = Router();

  router.get(
    "/api/brands/:brandId/orders",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      res.json({ orders: await listOrdersForBrand(brand.id) });
    }),
  );

  router.get(
    "/api/orders/:id",
    asyncHandler(async (req, res) => {
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "not_found" });
      res.json({ order });
    }),
  );

  router.post(
    "/api/orders/:id/advance-fulfilment",
    requireAuth,
    asyncHandler(async (req, res) => {
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "not_found" });
      const step = NEXT_FULFILMENT[order.fulfilmentStatus];
      if (!step) return res.status(409).json({ error: "already_delivered" });
      const updated = await updateOrder(order.id, { fulfilmentStatus: step.next }, step.label);
      res.json({ order: updated });
    }),
  );

  router.post(
    "/api/orders/:id/refund",
    requireAuth,
    asyncHandler(async (req, res) => {
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "not_found" });
      if (order.status !== "paid" && order.status !== "fulfilled") return res.status(409).json({ error: "not_refundable" });
      const updated = await updateOrder(order.id, { status: "refunded" }, "Refunded");
      await logAudit({ tenantId: order.tenantId, brandId: order.brandId, userId: req.user!.id, action: "order.refunded", entityType: "order", entityId: order.id, metadata: { total: order.total } });
      res.json({ order: updated });
    }),
  );

  router.post(
    "/api/orders/:id/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "not_found" });
      if (order.status === "refunded" || order.status === "canceled") return res.status(409).json({ error: "already_closed" });
      const updated = await updateOrder(order.id, { status: "canceled" }, "Cancelled");
      await logAudit({ tenantId: order.tenantId, brandId: order.brandId, userId: req.user!.id, action: "order.canceled", entityType: "order", entityId: order.id });
      res.json({ order: updated });
    }),
  );

  return router;
}
