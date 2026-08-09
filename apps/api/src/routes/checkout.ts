import { DeliveryMethod } from "@saleis-live/domain";
import { Router } from "express";
import { createOrder, getOrderById, updateOrder } from "../store/orders.js";
import { getProductById, upsertProduct } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

/**
 * Storefront's checkout — the real buyer flow (screens 11-17) isn't built
 * as its own phase yet, but this lets the whole create-brand → publish →
 * buy → fulfil loop be rehearsed end to end with real Order records. No
 * real payment or courier is involved: "confirm-test-payment" is clearly
 * a stand-in a merchant clicks themselves, not a real charge — see
 * Launch Studio's "Payments: Not connected" for the honest counterpart.
 */
export function checkoutRouter(): Router {
  const router = Router();

  router.post("/api/checkout/start", (req, res) => {
    const body = req.body as {
      brandId?: string;
      productId?: string;
      quantity?: number;
      customerName?: string;
      customerLocation?: string;
      deliveryMethod?: DeliveryMethod;
    };
    const brand = body.brandId ? getBrandById(body.brandId) : undefined;
    if (!brand) return res.status(400).json({ error: "unknown_brand" });
    const product = body.productId ? getProductById(body.productId) : undefined;
    if (!product || product.brandId !== brand.id) return res.status(400).json({ error: "unknown_product" });
    if (!body.customerName?.trim()) return res.status(400).json({ error: "missing_customer_name" });

    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    if (product.stock < quantity) return res.status(409).json({ error: "insufficient_stock" });

    upsertProduct({ ...product, stock: product.stock - quantity, updatedAt: new Date().toISOString() });

    const order = createOrder({
      tenantId: brand.tenantId,
      brandId: brand.id,
      campaignId: "",
      status: "reserved",
      lines: [{ productId: product.id, sku: product.sku, quantity, unitPrice: product.salePrice }],
      total: { amountMinor: product.salePrice.amountMinor * quantity, currency: product.salePrice.currency },
      paymentAdapterRef: null,
      customerName: body.customerName.trim(),
      customerLocation: body.customerLocation?.trim() || "—",
      deliveryMethod: body.deliveryMethod === "pickup" ? "pickup" : "courier",
      fulfilmentStatus: "not_started",
      timeline: [{ at: new Date().toISOString(), label: "Order created — awaiting payment" }],
    });
    res.status(201).json({ order });
  });

  router.post("/api/checkout/:id/confirm-test-payment", (req, res) => {
    const order = getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "reserved") return res.status(409).json({ error: "not_reservable" });
    const updated = updateOrder(order.id, { status: "paid", paymentAdapterRef: `test_${order.id}` }, "Payment confirmed (TEST — no real charge)");
    res.json({ order: updated });
  });

  return router;
}
