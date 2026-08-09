import { Brand, Order } from "@saleis-live/domain";
import { updateOrder } from "../store/orders.js";
import { HttpDeliveryAdapter } from "./httpAdapters.js";

/**
 * Books a courier shipment through the brand's connected delivery
 * integration once an order is confirmed paid — shared by both the TEST
 * payment-confirm route and the real payment webhook, so courier booking
 * happens exactly once, in one place, regardless of which path paid the
 * order. No-op for pickup orders or brands with no delivery integration
 * connected (fulfilment then stays manual, tracked via Orders/Order Detail).
 */
export async function bookDeliveryIfConnected(order: Order, brand: Brand): Promise<void> {
  if (order.deliveryMethod !== "courier") return;
  if (!brand.deliveryIntegration?.connected) return;
  try {
    const adapter = new HttpDeliveryAdapter(brand.deliveryIntegration);
    const { trackingRef } = await adapter.bookShipment({ orderId: order.id, address: order.customerLocation });
    updateOrder(order.id, { deliveryAdapterRef: trackingRef }, "Courier booked via connected delivery integration");
  } catch (err) {
    updateOrder(order.id, {}, `Courier booking failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}
