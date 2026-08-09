import { Order } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";

/**
 * In-memory only, same pragmatic starting point as products.ts. Seeded so
 * screens 08-10 have real data to render before a real buyer checkout
 * exists (that's the Phase 5 storefront flow, not built yet) — same
 * self-test-on-our-own-data precedent as products.ts's seed().
 */
let orders: Order[] = [];

function seed(): void {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  orders = [
    {
      id: "ord_1",
      tenantId: "t_demo",
      brandId: "b_demo",
      campaignId: "",
      status: "paid",
      lines: [{ productId: "P003", sku: "P003", quantity: 1, unitPrice: { amountMinor: 29900, currency: "AED" } }],
      total: { amountMinor: 29900, currency: "AED" },
      paymentAdapterRef: "tap_ref_1",
      customerName: "Aisha K.",
      customerPhone: "+971 50 111 2222",
      customerLocation: "Dubai",
      deliveryMethod: "courier",
      fulfilmentStatus: "ready_to_pack",
      timeline: [
        { at: at(30), label: "Order created" },
        { at: at(29), label: "Payment confirmed" },
        { at: at(28), label: "Stock reservation converted" },
      ],
      createdAt: at(30),
      updatedAt: at(28),
    },
    {
      id: "ord_2",
      tenantId: "t_demo",
      brandId: "b_demo",
      campaignId: "",
      status: "paid",
      lines: [{ productId: "P004", sku: "P004", quantity: 1, unitPrice: { amountMinor: 39900, currency: "AED" } }],
      total: { amountMinor: 39900, currency: "AED" },
      paymentAdapterRef: "tap_ref_2",
      customerName: "Mariam H.",
      customerPhone: "+971 50 222 3333",
      customerLocation: "Abu Dhabi",
      deliveryMethod: "pickup",
      fulfilmentStatus: "packed",
      timeline: [
        { at: at(40), label: "Order created" },
        { at: at(39), label: "Payment confirmed" },
        { at: at(20), label: "Packed" },
      ],
      createdAt: at(40),
      updatedAt: at(20),
    },
    {
      id: "ord_3",
      tenantId: "t_demo",
      brandId: "b_demo",
      campaignId: "",
      status: "reserved",
      lines: [{ productId: "P005", sku: "P005", quantity: 1, unitPrice: { amountMinor: 27900, currency: "AED" } }],
      total: { amountMinor: 27900, currency: "AED" },
      paymentAdapterRef: null,
      customerName: "Lina R.",
      customerPhone: "+971 50 333 4444",
      customerLocation: "Sharjah",
      deliveryMethod: "courier",
      fulfilmentStatus: "not_started",
      timeline: [{ at: at(5), label: "Order created — awaiting payment" }],
      createdAt: at(5),
      updatedAt: at(5),
    },
    {
      id: "ord_4",
      tenantId: "t_demo",
      brandId: "b_demo",
      campaignId: "",
      status: "refunded",
      lines: [{ productId: "P002", sku: "P002", quantity: 1, unitPrice: { amountMinor: 12900, currency: "AED" } }],
      total: { amountMinor: 12900, currency: "AED" },
      paymentAdapterRef: "tap_ref_4",
      customerName: "Noura A.",
      customerPhone: "+971 50 444 5555",
      customerLocation: "Dubai",
      deliveryMethod: "courier",
      fulfilmentStatus: "not_started",
      timeline: [
        { at: at(90), label: "Order created" },
        { at: at(89), label: "Payment confirmed" },
        { at: at(60), label: "Refunded" },
        { at: at(60), label: "Cancelled" },
      ],
      createdAt: at(90),
      updatedAt: at(60),
    },
    {
      id: "ord_5",
      tenantId: "t_demo",
      brandId: "b_demo",
      campaignId: "",
      status: "fulfilled",
      lines: [{ productId: "P001", sku: "P001", quantity: 1, unitPrice: { amountMinor: 34900, currency: "AED" } }],
      total: { amountMinor: 34900, currency: "AED" },
      paymentAdapterRef: "tap_ref_5",
      customerName: "Sara M.",
      customerPhone: "+971 50 555 6666",
      customerLocation: "Dubai",
      deliveryMethod: "courier",
      fulfilmentStatus: "in_transit",
      timeline: [
        { at: at(100), label: "Order created" },
        { at: at(99), label: "Payment confirmed" },
        { at: at(50), label: "Packed" },
        { at: at(10), label: "Booked with courier" },
      ],
      createdAt: at(100),
      updatedAt: at(10),
    },
  ];
}
seed();

export function listOrdersForBrand(brandId: string): Order[] {
  return orders
    .filter((o) => o.brandId === brandId)
    .slice()
    .sort((a, b) => b.timeline[b.timeline.length - 1].at.localeCompare(a.timeline[a.timeline.length - 1].at));
}

export function getOrderById(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function updateOrder(id: string, patch: Partial<Order>, timelineLabel?: string): Order | undefined {
  const order = getOrderById(id);
  if (!order) return undefined;
  Object.assign(order, patch, { updatedAt: new Date().toISOString() });
  if (timelineLabel) order.timeline = [...order.timeline, { at: new Date().toISOString(), label: timelineLabel }];
  return order;
}

export function createOrder(input: Omit<Order, "id" | "createdAt" | "updatedAt">): Order {
  const order: Order = { ...input, id: `ord_${randomUUID()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  orders = [...orders, order];
  return order;
}
