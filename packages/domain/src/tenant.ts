/**
 * Tenancy model — see blueprint section 2 ("Użytkownicy i struktura kont").
 * Every business record in this system carries both tenantId and brandId;
 * there is no record that belongs to a group without belonging to a
 * specific brand within it. Isolation between tenants is enforced at the
 * data-access layer, not just in the UI — see docs/product/saleis-live-blueprint-v1.md §11.
 */

/** A retail group — may own multiple brands (e.g. Chalhoub, Al Tayer). */
export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export type BrandStatus = "draft" | "active" | "suspended";

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
  /** Verification is required before a slug matching a recognizable brand name goes live — see blueprint §3. */
  slugVerified: boolean;
  customDomain: string | null;
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
