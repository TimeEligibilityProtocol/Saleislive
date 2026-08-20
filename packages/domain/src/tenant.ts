/**
 * Tenancy model — see blueprint section 2 ("Użytkownicy i struktura kont").
 * Every business record in this system carries both tenantId and brandId;
 * there is no record that belongs to a group without belonging to a
 * specific brand within it. Isolation between tenants is enforced at the
 * data-access layer, not just in the UI — see docs/product/saleis-live-blueprint-v1.md §11.
 */
import { HttpIntegrationConfig } from "./adapters.js";

/** A retail group — may own multiple brands (e.g. Chalhoub, Al Tayer). */
export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export type BrandStatus = "draft" | "active" | "suspended";

/** Header logo display height — Ola, 2026-08-18: the fixed 32px default read as too small once a real logo was uploaded. "Medium" is that same 32px so nobody's storefront changes unless they pick something else. */
export type LogoSizeId = "small" | "medium" | "large";
export const LOGO_SIZE_PX: Record<LogoSizeId, number> = { small: 24, medium: 32, large: 48 };

/** A single brand workspace — the unit that owns a catalog, theme, campaigns, and a subdomain slug. */
export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  /** Reserved slug — resolves to `${slug}.saleis.live` via wildcard DNS + the tenant router. Unique platform-wide. */
  slug: string;
  status: BrandStatus;
  country: string;
  currency: string;
  /** BCP-47-ish language code (e.g. "en", "ar") — screen 01 asks for both up front so storefront copy/RTL are set from day one, not retrofitted. */
  language: string;
  secondaryLanguage: string | null;
  /** Verification is required before a slug matching a recognizable brand name goes live — see blueprint §3. */
  slugVerified: boolean;
  customDomain: string | null;
  /** Shown in the storefront header in place of the "Your brand goes here" placeholder — set from Launch Studio's "Store design" tab. Null means the brand hasn't uploaded one yet. */
  logoUrl: string | null;
  /** Null means "medium" (24/32/48px small/medium/large — medium matches the header's original fixed size, so a brand that never touches this sees zero visual change). Set from the admin's Store design tab — the rough size category. */
  logoSize: LogoSizeId | null;
  /**
   * Fine-tune multiplier on top of logoSize's px value (1.0 = no change) —
   * set by dragging the logo's own resize handle directly on the live
   * storefront, not from admin. Ola, 2026-08-19: admin sets the rough
   * options (upload, size category), the live page is where you correct
   * exactly how it fits. Null = 1.0, zero visual change from logoSize alone.
   */
  logoScale: number | null;
  /** Null/true = storefront header shows the saleis.live wordmark beside the brand's own logo (today's default). False = hide it — a "Powered by saleis.live" note still appears in the footer either way, so the platform stays credited even when a brand goes fully white-label up top. Ola, 2026-08-19: "logo saleis.live - mozliwe do usuniecia z przodu... na dole powinno sie pokazac powered by saleis.live". */
  showPlatformLogo: boolean | null;
  /** Store-wide policy text shown on the storefront (screen 06's "Policies" tab) — plain text, no template engine. */
  returnPolicy: string | null;
  shippingPolicy: string | null;
  /** Screen 06's Payments/Delivery tabs — null until the brand connects their own integration through the generic HTTP adapter contract. */
  paymentIntegration: HttpIntegrationConfig | null;
  deliveryIntegration: HttpIntegrationConfig | null;
  createdAt: string;
}

export type Role = "group_owner" | "brand_admin" | "merchandiser" | "order_manager" | "analyst" | "read_only";

/** A person's membership in one brand workspace — a user with access to multiple brands holds one BrandMembership per brand. */
export interface BrandMembership {
  userId: string;
  brandId: string;
  tenantId: string;
  role: Role;
}
