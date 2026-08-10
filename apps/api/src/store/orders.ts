import { Order, OrderLine, OrderTimelineEntry } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { Order as PrismaOrder, Prisma } from "../generated/prisma/client.js";

const toJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Persisted in Postgres via Prisma. Seeded so screens 08-10 have real data
 * to render before a real buyer checkout exists — same self-test-on-our-
 * own-data precedent as products.ts's seed(). Orders need a real
 * Campaign row to satisfy the FK, so seeding creates a demo campaign
 * first if the demo brand doesn't have one yet.
 */

function toDomainOrder(row: PrismaOrder): Order {
  return {
    id: row.id,
    tenantId: row.tenantId,
    brandId: row.brandId,
    campaignId: row.campaignId,
    status: row.status,
    lines: row.lines as unknown as OrderLine[],
    total: { amountMinor: row.totalAmountMinor, currency: row.totalCurrency },
    paymentAdapterRef: row.paymentAdapterRef,
    deliveryAdapterRef: row.deliveryAdapterRef,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerLocation: row.customerLocation,
    deliveryMethod: row.deliveryMethod,
    fulfilmentStatus: row.fulfilmentStatus,
    timeline: row.timeline as unknown as OrderTimelineEntry[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureSeedData(): Promise<void> {
  const existing = await prisma.order.count({ where: { brandId: "b_demo" } });
  if (existing > 0) return;

  let campaign = await prisma.campaign.findFirst({ where: { brandId: "b_demo" } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        id: "camp_demo",
        tenantId: "t_demo",
        brandId: "b_demo",
        name: "Demo Sale",
        slug: "demo-sale",
        access: "public",
        status: "live",
        startsAt: new Date(),
        headline: "",
        shortDescription: "",
        themePreset: "editorial",
      },
    });
  }
  const campaignId = campaign.id;

  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  const timeline = (entries: [number, string][]): OrderTimelineEntry[] => entries.map(([m, label]) => ({ at: at(m).toISOString(), label }));

  const seeds = [
    {
      id: "ord_1",
      status: "paid" as const,
      lines: [{ productId: "P003", sku: "P003", quantity: 1, unitPrice: { amountMinor: 29900, currency: "AED" } }],
      totalAmountMinor: 29900,
      totalCurrency: "AED",
      paymentAdapterRef: "tap_ref_1",
      customerName: "Aisha K.",
      customerPhone: "+971 50 111 2222",
      customerLocation: "Dubai",
      deliveryMethod: "courier" as const,
      fulfilmentStatus: "ready_to_pack" as const,
      timeline: timeline([[30, "Order created"], [29, "Payment confirmed"], [28, "Stock reservation converted"]]),
      createdAt: at(30),
      updatedAt: at(28),
    },
    {
      id: "ord_2",
      status: "paid" as const,
      lines: [{ productId: "P004", sku: "P004", quantity: 1, unitPrice: { amountMinor: 39900, currency: "AED" } }],
      totalAmountMinor: 39900,
      totalCurrency: "AED",
      paymentAdapterRef: "tap_ref_2",
      customerName: "Mariam H.",
      customerPhone: "+971 50 222 3333",
      customerLocation: "Abu Dhabi",
      deliveryMethod: "pickup" as const,
      fulfilmentStatus: "packed" as const,
      timeline: timeline([[40, "Order created"], [39, "Payment confirmed"], [20, "Packed"]]),
      createdAt: at(40),
      updatedAt: at(20),
    },
    {
      id: "ord_3",
      status: "reserved" as const,
      lines: [{ productId: "P005", sku: "P005", quantity: 1, unitPrice: { amountMinor: 27900, currency: "AED" } }],
      totalAmountMinor: 27900,
      totalCurrency: "AED",
      paymentAdapterRef: null,
      customerName: "Lina R.",
      customerPhone: "+971 50 333 4444",
      customerLocation: "Sharjah",
      deliveryMethod: "courier" as const,
      fulfilmentStatus: "not_started" as const,
      timeline: timeline([[5, "Order created — awaiting payment"]]),
      createdAt: at(5),
      updatedAt: at(5),
    },
    {
      id: "ord_4",
      status: "refunded" as const,
      lines: [{ productId: "P002", sku: "P002", quantity: 1, unitPrice: { amountMinor: 12900, currency: "AED" } }],
      totalAmountMinor: 12900,
      totalCurrency: "AED",
      paymentAdapterRef: "tap_ref_4",
      customerName: "Noura A.",
      customerPhone: "+971 50 444 5555",
      customerLocation: "Dubai",
      deliveryMethod: "courier" as const,
      fulfilmentStatus: "not_started" as const,
      timeline: timeline([[90, "Order created"], [89, "Payment confirmed"], [60, "Refunded"], [60, "Cancelled"]]),
      createdAt: at(90),
      updatedAt: at(60),
    },
    {
      id: "ord_5",
      status: "fulfilled" as const,
      lines: [{ productId: "P001", sku: "P001", quantity: 1, unitPrice: { amountMinor: 34900, currency: "AED" } }],
      totalAmountMinor: 34900,
      totalCurrency: "AED",
      paymentAdapterRef: "tap_ref_5",
      customerName: "Sara M.",
      customerPhone: "+971 50 555 6666",
      customerLocation: "Dubai",
      deliveryMethod: "courier" as const,
      fulfilmentStatus: "in_transit" as const,
      timeline: timeline([[100, "Order created"], [99, "Payment confirmed"], [50, "Packed"], [10, "Booked with courier"]]),
      createdAt: at(100),
      updatedAt: at(10),
    },
  ];

  for (const s of seeds) {
    await prisma.order.create({
      data: {
        id: s.id,
        tenantId: "t_demo",
        brandId: "b_demo",
        campaignId,
        status: s.status,
        lines: toJson(s.lines),
        totalAmountMinor: s.totalAmountMinor,
        totalCurrency: s.totalCurrency,
        paymentAdapterRef: s.paymentAdapterRef,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        customerLocation: s.customerLocation,
        deliveryMethod: s.deliveryMethod,
        fulfilmentStatus: s.fulfilmentStatus,
        timeline: toJson(s.timeline),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }
}

export async function listOrdersForBrand(brandId: string): Promise<Order[]> {
  const rows = await prisma.order.findMany({ where: { brandId } });
  const orders = rows.map(toDomainOrder);
  return orders.sort((a, b) => b.timeline[b.timeline.length - 1].at.localeCompare(a.timeline[a.timeline.length - 1].at));
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const row = await prisma.order.findUnique({ where: { id } });
  return row ? toDomainOrder(row) : undefined;
}

export async function updateOrder(id: string, patch: Partial<Order>, timelineLabel?: string): Promise<Order | undefined> {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return undefined;
  const nextTimeline = timelineLabel
    ? [...(existing.timeline as unknown as OrderTimelineEntry[]), { at: new Date().toISOString(), label: timelineLabel }]
    : undefined;
  const row = await prisma.order.update({
    where: { id },
    data: {
      status: patch.status,
      lines: patch.lines !== undefined ? toJson(patch.lines) : undefined,
      totalAmountMinor: patch.total?.amountMinor,
      totalCurrency: patch.total?.currency,
      paymentAdapterRef: patch.paymentAdapterRef,
      deliveryAdapterRef: patch.deliveryAdapterRef,
      fulfilmentStatus: patch.fulfilmentStatus,
      timeline: nextTimeline !== undefined ? toJson(nextTimeline) : undefined,
    },
  });
  return toDomainOrder(row);
}

export async function createOrder(input: Omit<Order, "id" | "createdAt" | "updatedAt">): Promise<Order> {
  const row = await prisma.order.create({
    data: {
      id: `ord_${randomUUID()}`,
      tenantId: input.tenantId,
      brandId: input.brandId,
      campaignId: input.campaignId,
      status: input.status,
      lines: toJson(input.lines),
      totalAmountMinor: input.total.amountMinor,
      totalCurrency: input.total.currency,
      paymentAdapterRef: input.paymentAdapterRef,
      deliveryAdapterRef: input.deliveryAdapterRef,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerLocation: input.customerLocation,
      deliveryMethod: input.deliveryMethod,
      fulfilmentStatus: input.fulfilmentStatus,
      timeline: toJson(input.timeline),
    },
  });
  return toDomainOrder(row);
}
