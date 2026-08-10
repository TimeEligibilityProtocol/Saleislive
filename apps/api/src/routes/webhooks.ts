import { DeliveryStatus, FulfilmentStatus, PaymentStatus } from "@saleis-live/domain";
import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { bookDeliveryIfConnected } from "../lib/orderFulfilment.js";
import { getOrderById, updateOrder } from "../store/orders.js";
import { getBrandById } from "../store/tenants.js";

/**
 * Where a brand's connected payment/delivery integration reports status
 * changes back to us — the other half of the "bring your own integration"
 * contract documented in Launch Studio's Payments/Delivery tabs. Auth is
 * the per-brand webhookSecret generated when they connected, sent as
 * X-Webhook-Secret — not a signature scheme, deliberately simple since
 * this is a bridge the brand's own team controls end to end.
 */
export function webhooksRouter(): Router {
  const router = Router();

  router.post(
    "/api/webhooks/payment/:brandId",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand?.paymentIntegration?.connected) return res.status(404).json({ error: "not_connected" });
      if (req.header("X-Webhook-Secret") !== brand.paymentIntegration.webhookSecret) return res.status(401).json({ error: "invalid_secret" });

      const { orderId, status, ref } = req.body as { orderId?: string; status?: PaymentStatus; ref?: string };
      const order = orderId ? await getOrderById(orderId) : undefined;
      if (!order || order.brandId !== brand.id) return res.status(404).json({ error: "unknown_order" });

      if (status === "captured") {
        const paid = await updateOrder(order.id, { status: "paid", paymentAdapterRef: ref ?? order.paymentAdapterRef }, "Payment confirmed by connected processor");
        if (paid) await bookDeliveryIfConnected(paid, brand);
      } else if (status === "refunded") {
        await updateOrder(order.id, { status: "refunded" }, "Refunded by connected processor");
      } else if (status === "failed") {
        await updateOrder(order.id, {}, "Payment failed at connected processor");
      }
      res.json({ ok: true });
    }),
  );

  router.post(
    "/api/webhooks/delivery/:brandId",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand?.deliveryIntegration?.connected) return res.status(404).json({ error: "not_connected" });
      if (req.header("X-Webhook-Secret") !== brand.deliveryIntegration.webhookSecret) return res.status(401).json({ error: "invalid_secret" });

      const { orderId, status, trackingRef } = req.body as { orderId?: string; status?: DeliveryStatus; trackingRef?: string };
      const order = orderId ? await getOrderById(orderId) : undefined;
      if (!order || order.brandId !== brand.id) return res.status(404).json({ error: "unknown_order" });

      const fulfilmentByDeliveryStatus: Partial<Record<DeliveryStatus, FulfilmentStatus>> = {
        booked: "ready_to_pack",
        in_transit: "in_transit",
        delivered: "delivered",
      };
      const mapped = status ? fulfilmentByDeliveryStatus[status] : undefined;
      await updateOrder(
        order.id,
        { deliveryAdapterRef: trackingRef ?? order.deliveryAdapterRef, ...(mapped ? { fulfilmentStatus: mapped } : {}) },
        `Delivery status updated by connected courier: ${status ?? "unknown"}`,
      );
      res.json({ ok: true });
    }),
  );

  return router;
}
