import { Brand, Tenant } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";

/**
 * In-memory only, same pragmatic starting point as wearto.you — swap for
 * a real database before anything but local self-testing. Seeded with a
 * couple of brands so the team can test the import/theme/campaign flow
 * on data we create ourselves (no client files needed yet — see
 * blueprint §13 step 1, deliberately not blocking on that here).
 */
let tenants: Tenant[] = [];
let brands: Brand[] = [];

function seed(): void {
  const tenant: Tenant = { id: "t_demo", name: "Demo Group", createdAt: new Date(0).toISOString() };
  tenants = [tenant];
  brands = [
    {
      id: "b_demo",
      tenantId: tenant.id,
      name: "Demo Brand",
      slug: "demo",
      status: "active",
      country: "AE",
      currency: "AED",
      language: "en",
      secondaryLanguage: "ar",
      slugVerified: true,
      customDomain: null,
      returnPolicy: null,
      shippingPolicy: null,
      paymentIntegration: null,
      deliveryIntegration: null,
      createdAt: new Date(0).toISOString(),
    },
  ];
}
seed();

export function getBrandBySlug(slug: string): Brand | undefined {
  return brands.find((b) => b.slug === slug);
}

export function getBrandById(id: string): Brand | undefined {
  return brands.find((b) => b.id === id);
}

export function listBrandsForTenant(tenantId: string): Brand[] {
  return brands.filter((b) => b.tenantId === tenantId);
}

export function isSlugAvailable(slug: string): boolean {
  return !brands.some((b) => b.slug === slug);
}

export function createBrand(
  input: Omit<Brand, "id" | "createdAt" | "status" | "slugVerified" | "customDomain" | "returnPolicy" | "shippingPolicy" | "paymentIntegration" | "deliveryIntegration">,
): Brand {
  const brand: Brand = {
    ...input,
    id: `b_${randomUUID()}`,
    status: "active",
    slugVerified: false,
    customDomain: null,
    returnPolicy: null,
    shippingPolicy: null,
    paymentIntegration: null,
    deliveryIntegration: null,
    createdAt: new Date().toISOString(),
  };
  brands = [...brands, brand];
  return brand;
}

/** Screen 06's "Policies" tab. */
export function updateBrandPolicies(id: string, patch: Partial<{ returnPolicy: string; shippingPolicy: string }>): Brand | undefined {
  const brand = getBrandById(id);
  if (!brand) return undefined;
  if (patch.returnPolicy !== undefined) brand.returnPolicy = patch.returnPolicy;
  if (patch.shippingPolicy !== undefined) brand.shippingPolicy = patch.shippingPolicy;
  return brand;
}

/**
 * Screen 06's Payments/Delivery tabs — "bring your own integration".
 * Passing null disconnects (clears the config back to null). Passing
 * {endpointUrl, apiKey} connects/reconnects: keeps the existing
 * webhookSecret if one was already generated (so the brand doesn't have
 * to reconfigure their webhook on every edit), otherwise generates one.
 */
export function updateBrandIntegration(id: string, kind: "payment" | "delivery", patch: { endpointUrl: string; apiKey: string } | null): Brand | undefined {
  const brand = getBrandById(id);
  if (!brand) return undefined;
  const field = kind === "payment" ? "paymentIntegration" : "deliveryIntegration";
  if (patch === null) {
    brand[field] = null;
    return brand;
  }
  const existingSecret = brand[field]?.webhookSecret;
  brand[field] = {
    endpointUrl: patch.endpointUrl,
    apiKey: patch.apiKey,
    webhookSecret: existingSecret ?? randomUUID(),
    connected: true,
  };
  return brand;
}
