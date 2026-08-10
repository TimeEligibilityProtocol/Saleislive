import { Brand, HttpIntegrationConfig, Tenant } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { Brand as PrismaBrand, Prisma, Tenant as PrismaTenant } from "../generated/prisma/client.js";

/**
 * Persisted in Postgres via Prisma (apps/api/prisma/schema.prisma) — see
 * that file's header for why. This module is the only place that knows
 * about the Prisma row shape; everywhere else in the API deals in the
 * plain domain types from packages/domain.
 */

function toDomainTenant(row: PrismaTenant): Tenant {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}

function toDomainBrand(row: PrismaBrand): Brand {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    status: row.status,
    country: row.country,
    currency: row.currency,
    language: row.language,
    secondaryLanguage: row.secondaryLanguage,
    slugVerified: row.slugVerified,
    customDomain: row.customDomain,
    returnPolicy: row.returnPolicy,
    shippingPolicy: row.shippingPolicy,
    paymentIntegration: row.paymentIntegration as HttpIntegrationConfig | null,
    deliveryIntegration: row.deliveryIntegration as HttpIntegrationConfig | null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Idempotent — safe to call on every boot. Same demo tenant/brand the in-memory store used to seed, now persisted. */
export async function ensureSeedData(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { id: "t_demo" },
    update: {},
    create: { id: "t_demo", name: "Demo Group" },
  });
  await prisma.brand.upsert({
    where: { id: "b_demo" },
    update: {},
    create: {
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
    },
  });
}

export async function getBrandBySlug(slug: string): Promise<Brand | undefined> {
  const row = await prisma.brand.findUnique({ where: { slug } });
  return row ? toDomainBrand(row) : undefined;
}

export async function getBrandById(id: string): Promise<Brand | undefined> {
  const row = await prisma.brand.findUnique({ where: { id } });
  return row ? toDomainBrand(row) : undefined;
}

export async function listBrandsForTenant(tenantId: string): Promise<Brand[]> {
  const rows = await prisma.brand.findMany({ where: { tenantId } });
  return rows.map(toDomainBrand);
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const row = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
  return row === null;
}

export async function createBrand(
  input: Omit<Brand, "id" | "createdAt" | "status" | "slugVerified" | "customDomain" | "returnPolicy" | "shippingPolicy" | "paymentIntegration" | "deliveryIntegration">,
): Promise<Brand> {
  const row = await prisma.brand.create({
    data: {
      id: `b_${randomUUID()}`,
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      country: input.country,
      currency: input.currency,
      language: input.language,
      secondaryLanguage: input.secondaryLanguage,
      status: "active",
      slugVerified: false,
    },
  });
  return toDomainBrand(row);
}

/** Editing an already-created brand's step-1 fields — everything from screen 01 except the slug, which storefront URLs already depend on so it stays fixed once created. */
export async function updateBrandProfile(id: string, patch: { name: string; country: string; currency: string; language: string; secondaryLanguage: string | null }): Promise<Brand | undefined> {
  try {
    const row = await prisma.brand.update({ where: { id }, data: patch });
    return toDomainBrand(row);
  } catch {
    return undefined;
  }
}

/** Screen 06's "Policies" tab. */
export async function updateBrandPolicies(id: string, patch: Partial<{ returnPolicy: string; shippingPolicy: string }>): Promise<Brand | undefined> {
  try {
    const row = await prisma.brand.update({ where: { id }, data: patch });
    return toDomainBrand(row);
  } catch {
    return undefined;
  }
}

/**
 * Screen 06's Payments/Delivery tabs — "bring your own integration".
 * Passing null disconnects (clears the config back to null). Passing
 * {endpointUrl, apiKey} connects/reconnects: keeps the existing
 * webhookSecret if one was already generated (so the brand doesn't have
 * to reconfigure their webhook on every edit), otherwise generates one.
 */
export async function updateBrandIntegration(id: string, kind: "payment" | "delivery", patch: { endpointUrl: string; apiKey: string } | null): Promise<Brand | undefined> {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) return undefined;
  const field = kind === "payment" ? "paymentIntegration" : "deliveryIntegration";
  let value: HttpIntegrationConfig | null;
  if (patch === null) {
    value = null;
  } else {
    const current = existing[field] as HttpIntegrationConfig | null;
    value = {
      endpointUrl: patch.endpointUrl,
      apiKey: patch.apiKey,
      webhookSecret: current?.webhookSecret ?? randomUUID(),
      connected: true,
    };
  }
  const row = await prisma.brand.update({ where: { id }, data: { [field]: value === null ? Prisma.DbNull : value } });
  return toDomainBrand(row);
}
