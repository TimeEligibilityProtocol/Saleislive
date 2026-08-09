import { Money } from "./money.js";

/**
 * Order state machine — see blueprint §10 ("Inventory reservation, order
 * state machine, refunds, audit log") and §12 acceptance criteria
 * ("Dwa równoległe checkouty nie sprzedają tej samej jednostki"). A
 * reservation is a time-boxed hold created at checkout start, separate
 * from the order itself so it can expire without ever having been one.
 */
export type OrderStatus = "reserved" | "paid" | "fulfilled" | "refunded" | "canceled";

/** Tracked separately from OrderStatus — screen 09's own framing is "manage payment and fulfilment separately," since a paid order can sit at any point in packing/shipping independent of its payment state. */
export type FulfilmentStatus = "not_started" | "ready_to_pack" | "packed" | "in_transit" | "delivered";
export type DeliveryMethod = "courier" | "pickup";

export interface OrderLine {
  productId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}

export interface OrderTimelineEntry {
  at: string;
  label: string;
}

export interface Order {
  id: string;
  tenantId: string;
  brandId: string;
  campaignId: string;
  status: OrderStatus;
  lines: OrderLine[];
  total: Money;
  /** Payment happens through the brand's own connected payment adapter — Saleis.live never holds buyer funds. See blueprint §8. */
  paymentAdapterRef: string | null;
  /** Set once the brand's connected delivery adapter books a shipment — their own tracking reference. */
  deliveryAdapterRef: string | null;
  customerName: string;
  customerPhone: string;
  customerLocation: string;
  deliveryMethod: DeliveryMethod;
  fulfilmentStatus: FulfilmentStatus;
  timeline: OrderTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export const INVENTORY_RESERVATION_TTL_SECONDS = 600;

export interface InventoryReservation {
  id: string;
  productId: string;
  quantity: number;
  orderId: string | null;
  expiresAt: string;
}
