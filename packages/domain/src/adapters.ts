/**
 * Payments and delivery are integration points, not something Saleis.live
 * operates — see blueprint §8: the brand contracts with its own payment
 * operator, passes KYC/KYB, and receives funds directly; Saleis.live only
 * ever sees a status. These interfaces define the adapter boundary so a
 * real operator (Stripe, Tap, etc.) or courier can be plugged in later
 * without changing checkout/fulfillment code — see blueprint §10
 * ("Adapter pattern: operator płatności i kurier nie są zaszyci w core").
 */
import { Money } from "./money.js";

export type PaymentStatus = "pending" | "authorized" | "captured" | "failed" | "refunded";

export interface PaymentAdapter {
  id: string;
  name: string;
  createCheckout(params: { orderId: string; amount: Money; returnUrl: string }): Promise<{ checkoutUrl: string; ref: string }>;
  getStatus(ref: string): Promise<PaymentStatus>;
  refund(ref: string, amount: Money): Promise<{ status: PaymentStatus }>;
}

export type DeliveryStatus = "pending" | "booked" | "in_transit" | "delivered" | "failed";

export interface DeliveryAdapter {
  id: string;
  name: string;
  bookShipment(params: { orderId: string; address: string | null }): Promise<{ trackingRef: string }>;
  getStatus(trackingRef: string): Promise<DeliveryStatus>;
}
