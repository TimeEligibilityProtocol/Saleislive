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
      lines: [{ productId: "p3", sku: "DEMO-003", quantity: 1, unitPrice: { amountMinor: 78000, currency: "AED" } }],
      total: { amountMinor: 78000, currency: "AED" },
      paymentAdapterRef: "tap_ref_1",
      customerName: "Aisha K.",
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
      lines: [{ productId: "p4", sku: "DEMO-004", quantity: 1, unitPrice: { amountMinor: 65000, currency: "AED" } }],
      total: { amountMinor: 65000, currency: "AED" },
      paymentAdapterRef: "tap_ref_2",
      customerName: "Mariam H.",
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
      lines: [{ productId: "p5", sku: "DEMO-005", quantity: 1, unitPrice: { amountMinor: 185000, currency: "AED" } }],
      total: { amountMinor: 185000, currency: "AED" },
      paymentAdapterRef: null,
      customerName: "Lina R.",
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
      lines: [{ productId: "p8", sku: "DEMO-008", quantity: 1, unitPrice: { amountMinor: 38000, currency: "AED" } }],
      total: { amountMinor: 38000, currency: "AED" },
      paymentAdapterRef: "tap_ref_4",
      customerName: "Noura A.",
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
      lines: [{ productId: "p1", sku: "DEMO-001", quantity: 1, unitPrice: { amountMinor: 46000, currency: "AED" } }],
      total: { amountMinor: 46000, currency: "AED" },
      paymentAdapterRef: "tap_ref_5",
      customerName: "Sara M.",
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
