import { Campaign } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { Campaign as PrismaCampaign, Prisma } from "../generated/prisma/client.js";

const toJson = (v: unknown) => v as Prisma.InputJsonValue;

/** Persisted in Postgres via Prisma. */

function toDomainCampaign(row: PrismaCampaign): Campaign {
  return {
    id: row.id,
    tenantId: row.tenantId,
    brandId: row.brandId,
    name: row.name,
    slug: row.slug,
    access: row.access,
    status: row.status,
    productIds: row.productIds as unknown as string[],
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    headline: row.headline,
    shortDescription: row.shortDescription,
    heroDesktopUrl: row.heroDesktopUrl,
    heroMobileUrl: row.heroMobileUrl,
    themePreset: row.themePreset as Campaign["themePreset"],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCampaignsForBrand(brandId: string): Promise<Campaign[]> {
  const rows = await prisma.campaign.findMany({ where: { brandId } });
  return rows.map(toDomainCampaign);
}

export async function getCampaignById(id: string): Promise<Campaign | undefined> {
  const row = await prisma.campaign.findUnique({ where: { id } });
  return row ? toDomainCampaign(row) : undefined;
}

/**
 * Screen 06 (Launch Studio) assumes one sale in progress per brand at a
 * time for MVP — a full campaign list/switcher is later scope. Returns
 * the brand's first campaign, creating an empty draft one on first visit.
 */
export async function getOrCreateCurrentCampaign(tenantId: string, brandId: string): Promise<Campaign> {
  const existing = await prisma.campaign.findFirst({ where: { brandId } });
  if (existing) return toDomainCampaign(existing);
  const row = await prisma.campaign.create({
    data: {
      id: `camp_${randomUUID()}`,
      tenantId,
      brandId,
      name: "",
      slug: `draft-${randomUUID().slice(0, 8)}`,
      access: "public",
      status: "draft",
      productIds: [],
      startsAt: new Date(),
      headline: "",
      shortDescription: "",
      themePreset: "editorial",
    },
  });
  return toDomainCampaign(row);
}

export async function updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "tenantId" | "brandId" | "createdAt">>): Promise<Campaign | undefined> {
  try {
    const row = await prisma.campaign.update({
      where: { id },
      data: {
        ...patch,
        productIds: patch.productIds !== undefined ? toJson(patch.productIds) : undefined,
        startsAt: patch.startsAt !== undefined ? new Date(patch.startsAt) : undefined,
        endsAt: patch.endsAt !== undefined ? (patch.endsAt ? new Date(patch.endsAt) : null) : undefined,
      },
    });
    return toDomainCampaign(row);
  } catch {
    return undefined;
  }
}
