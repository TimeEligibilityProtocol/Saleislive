import { DeliveryMethod, OrderLine } from "@saleis-live/domain";
import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpPaymentAdapter } from "../lib/httpAdapters.js";
import { bookDeliveryIfConnected } from "../lib/orderFulfilment.js";
import { getOrCreateCurrentCampaign } from "../store/campaigns.js";
import { createOrder, getOrderById, updateOrder } from "../store/orders.js";
import { getProductById, upsertProduct } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

/**
 * Storefront's checkout — the real buyer flow (screens 11-17) now has a
 * proper bag/delivery/payment sequence. If the brand has connected a real
 * payment integration (Launch Studio's Payments tab), /checkout/start
 * calls it and returns a real checkoutUrl to redirect the buyer to.
 * Otherwise — the demo brand's actual state — nothing real is involved:
 * "confirm-test-payment" is clearly a stand-in a merchant or tester
 * clicks themselves, not a real charge. Screen 16's mockup shows a
 * card-number field; that's deliberately NOT built here — a fake card
 * input would look like real payment-detail collection, which this
 * project never does even in test mode.
 */
// Must match the storefront's COURIER_FEE_MINOR (apps/storefront/src/App.tsx) — a flat demo
// fee, not a real courier rate lookup, so the price shown to the buyer matches what's recorded.
const COURIER_FEE_MINOR = 2500;

export function checkoutRouter(): Router {
  const router = Router();

  router.post(
    "/api/checkout/start",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        brandId?: string;
        items?: { productId: string; quantity: number }[];
        customerName?: string;
        customerPhone?: string;
        customerLocation?: string;
        deliveryMethod?: DeliveryMethod;
        returnUrl?: string;
      };
      const brand = body.brandId ? await getBrandById(body.brandId) : undefined;
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      if (!body.items?.length) return res.status(400).json({ error: "empty_bag" });
      if (!body.customerName?.trim()) return res.status(400).json({ error: "missing_customer_name" });

      const campaign = await getOrCreateCurrentCampaign(brand.tenantId, brand.id);

      const lines: OrderLine[] = [];
      for (const item of body.items) {
        const product = await getProductById(item.productId);
        if (!product || product.brandId !== brand.id) return res.status(400).json({ error: "unknown_product" });
        // A product taken out of the sale (Go live's board) shouldn't stay
        // buyable just because it's still sitting in someone's bag from
        // before it was removed.
        if (!campaign.productIds.includes(product.id)) return res.status(400).json({ error: "not_in_sale" });
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        if (product.stock < quantity) return res.status(409).json({ error: "insufficient_stock", productId: product.id });
        lines.push({ productId: product.id, sku: product.sku, quantity, unitPrice: product.salePrice });
      }

      // All validated — now actually decrement stock.
      for (const line of lines) {
        const product = (await getProductById(line.productId))!;
        await upsertProduct({ ...product, stock: product.stock - line.quantity, updatedAt: new Date().toISOString() });
      }

      const deliveryMethod: DeliveryMethod = body.deliveryMethod === "pickup" ? "pickup" : "courier";
      const itemsTotal = lines.reduce((sum, l) => sum + l.unitPrice.amountMinor * l.quantity, 0);
      const total = itemsTotal + (deliveryMethod === "courier" ? COURIER_FEE_MINOR : 0);
      const currency = lines[0].unitPrice.currency;

      const order = await createOrder({
        tenantId: brand.tenantId,
        brandId: brand.id,
        campaignId: campaign.id,
        status: "reserved",
        lines,
        total: { amountMinor: total, currency },
        paymentAdapterRef: null,
        deliveryAdapterRef: null,
        customerName: body.customerName.trim(),
        customerPhone: body.customerPhone?.trim() || "—",
        customerLocation: body.customerLocation?.trim() || "—",
        deliveryMethod,
        fulfilmentStatus: "not_started",
        timeline: [{ at: new Date().toISOString(), label: "Order created — awaiting payment" }],
      });

      // Brand has a real payment integration connected — hand the buyer off to it instead of
      // the TEST flow. If the call fails (bad config, their bridge is down), fall back to TEST
      // mode rather than stranding the buyer with stock already reserved.
      if (brand.paymentIntegration?.connected) {
        try {
          const adapter = new HttpPaymentAdapter(brand.paymentIntegration);
          const { checkoutUrl, ref } = await adapter.createCheckout({
            orderId: order.id,
            amount: order.total,
            returnUrl: body.returnUrl?.trim() || "",
          });
          await updateOrder(order.id, { paymentAdapterRef: ref }, "Handed off to connected payment integration");
          return res.status(201).json({ order: await getOrderById(order.id), checkoutUrl });
        } catch (err) {
          await updateOrder(order.id, {}, `Payment integration error, falling back to test mode: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      res.status(201).json({ order });
    }),
  );

  router.post(
    "/api/checkout/:id/confirm-test-payment",
    asyncHandler(async (req, res) => {
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "not_found" });
      if (order.status !== "reserved") return res.status(409).json({ error: "not_reservable" });
      const updated = await updateOrder(order.id, { status: "paid", paymentAdapterRef: `test_${order.id}` }, "Payment confirmed (TEST — no real charge)");
      const brand = await getBrandById(order.brandId);
      if (updated && brand) await bookDeliveryIfConnected(updated, brand);
      res.json({ order: updated });
    }),
  );

  return router;
}
