import { DeliveryMethod, OrderLine } from "@saleis-live/domain";
import { Router } from "express";
import { createOrder, getOrderById, updateOrder } from "../store/orders.js";
import { getProductById, upsertProduct } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

/**
 * Storefront's checkout — the real buyer flow (screens 11-17) now has a
 * proper bag/delivery/payment sequence. No real payment or courier is
 * involved: "confirm-test-payment" is clearly a stand-in a merchant or
 * tester clicks themselves, not a real charge — see Launch Studio's
 * "Payments: Not connected" for the honest counterpart. Screen 16's
 * mockup shows a card-number field; that's deliberately NOT built here
 * — a fake card input would look like real payment-detail collection,
 * which this project never does even in test mode.
 */
// Must match the storefront's COURIER_FEE_MINOR (apps/storefront/src/App.tsx) — a flat demo
// fee, not a real courier rate lookup, so the price shown to the buyer matches what's recorded.
const COURIER_FEE_MINOR = 2500;

export function checkoutRouter(): Router {
  const router = Router();

  router.post("/api/checkout/start", (req, res) => {
    const body = req.body as {
      brandId?: string;
      items?: { productId: string; quantity: number }[];
      customerName?: string;
      customerPhone?: string;
      customerLocation?: string;
      deliveryMethod?: DeliveryMethod;
    };
    const brand = body.brandId ? getBrandById(body.brandId) : undefined;
    if (!brand) return res.status(400).json({ error: "unknown_brand" });
    if (!body.items?.length) return res.status(400).json({ error: "empty_bag" });
    if (!body.customerName?.trim()) return res.status(400).json({ error: "missing_customer_name" });

    const lines: OrderLine[] = [];
    for (const item of body.items) {
      const product = getProductById(item.productId);
      if (!product || product.brandId !== brand.id) return res.status(400).json({ error: "unknown_product" });
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      if (product.stock < quantity) return res.status(409).json({ error: "insufficient_stock", productId: product.id });
      lines.push({ productId: product.id, sku: product.sku, quantity, unitPrice: product.salePrice });
    }

    // All validated — now actually decrement stock.
    for (const line of lines) {
      const product = getProductById(line.productId)!;
      upsertProduct({ ...product, stock: product.stock - line.quantity, updatedAt: new Date().toISOString() });
    }

    const deliveryMethod: DeliveryMethod = body.deliveryMethod === "pickup" ? "pickup" : "courier";
    const itemsTotal = lines.reduce((sum, l) => sum + l.unitPrice.amountMinor * l.quantity, 0);
    const total = itemsTotal + (deliveryMethod === "courier" ? COURIER_FEE_MINOR : 0);
    const currency = lines[0].unitPrice.currency;

    const order = createOrder({
      tenantId: brand.tenantId,
      brandId: brand.id,
      campaignId: "",
      status: "reserved",
      lines,
      total: { amountMinor: total, currency },
      paymentAdapterRef: null,
      customerName: body.customerName.trim(),
      customerPhone: body.customerPhone?.trim() || "—",
      customerLocation: body.customerLocation?.trim() || "—",
      deliveryMethod,
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
