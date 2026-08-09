import { DeliveryAdapter, DeliveryStatus, HttpIntegrationConfig, Money, PaymentAdapter, PaymentStatus } from "@saleis-live/domain";

/**
 * The "bring your own integration" adapters — implement PaymentAdapter/
 * DeliveryAdapter by calling a fixed HTTP contract on the brand's own
 * bridge service, instead of a processor-specific SDK. This is what lets
 * a brand's own IT team (or whoever they hire) connect their real Stripe/
 * Tap/courier account without Saleis.live writing or holding credentials
 * for any of them. The exact request/response shapes are documented for
 * the brand in Launch Studio's Payments/Delivery tabs — keep this file's
 * request/response shapes in sync with that copy if either changes.
 */
export class HttpPaymentAdapter implements PaymentAdapter {
  id = "http-integration";
  name = "Custom integration";

  constructor(private config: HttpIntegrationConfig) {}

  async createCheckout(params: { orderId: string; amount: Money; returnUrl: string }): Promise<{ checkoutUrl: string; ref: string }> {
    const res = await fetch(`${this.config.endpointUrl}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        orderId: params.orderId,
        amountMinor: params.amount.amountMinor,
        currency: params.amount.currency,
        returnUrl: params.returnUrl,
      }),
    });
    if (!res.ok) throw new Error(`Payment integration returned ${res.status}`);
    return res.json() as Promise<{ checkoutUrl: string; ref: string }>;
  }

  async getStatus(ref: string): Promise<PaymentStatus> {
    const res = await fetch(`${this.config.endpointUrl}/status/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (!res.ok) throw new Error(`Payment integration returned ${res.status}`);
    const body = (await res.json()) as { status: PaymentStatus };
    return body.status;
  }

  async refund(ref: string, amount: Money): Promise<{ status: PaymentStatus }> {
    const res = await fetch(`${this.config.endpointUrl}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ ref, amountMinor: amount.amountMinor, currency: amount.currency }),
    });
    if (!res.ok) throw new Error(`Payment integration returned ${res.status}`);
    return res.json() as Promise<{ status: PaymentStatus }>;
  }
}

export class HttpDeliveryAdapter implements DeliveryAdapter {
  id = "http-integration";
  name = "Custom integration";

  constructor(private config: HttpIntegrationConfig) {}

  async bookShipment(params: { orderId: string; address: string | null }): Promise<{ trackingRef: string }> {
    const res = await fetch(`${this.config.endpointUrl}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ orderId: params.orderId, address: params.address }),
    });
    if (!res.ok) throw new Error(`Delivery integration returned ${res.status}`);
    return res.json() as Promise<{ trackingRef: string }>;
  }

  async getStatus(trackingRef: string): Promise<DeliveryStatus> {
    const res = await fetch(`${this.config.endpointUrl}/status/${encodeURIComponent(trackingRef)}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (!res.ok) throw new Error(`Delivery integration returned ${res.status}`);
    const body = (await res.json()) as { status: DeliveryStatus };
    return body.status;
  }
}
