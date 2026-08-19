import { Campaign } from "@saleis-live/domain";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { Campaign as PrismaCampaign, Prisma } from "../generated/prisma/client.js";

const toJson = (v: unknown) => v as Prisma.InputJsonValue;
const BCRYPT_ROUNDS = 12;

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
    heroColorPreset: row.heroColorPreset as Campaign["heroColorPreset"],
    heroFontPreset: row.heroFontPreset,
    heroTitleSize: row.heroTitleSize as Campaign["heroTitleSize"],
    showHeroCta: row.showHeroCta,
    heroImageOffsetX: row.heroImageOffsetX,
    heroImageOffsetY: row.heroImageOffsetY,
    heroImageScale: row.heroImageScale,
    heroTextOffsetX: row.heroTextOffsetX,
    heroTextOffsetY: row.heroTextOffsetY,
    heroImageOffsetXMobile: row.heroImageOffsetXMobile,
    heroImageOffsetYMobile: row.heroImageOffsetYMobile,
    heroImageScaleMobile: row.heroImageScaleMobile,
    heroTextOffsetXMobile: row.heroTextOffsetXMobile,
    heroTextOffsetYMobile: row.heroTextOffsetYMobile,
    hasAccessPassword: !!row.accessPasswordHash,
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

/** Sets/changes the shared password for a "password"-access campaign. Passing null clears it (access reverts to needing no password to unlock, though the UI should also flip `access` away from "password" when doing this). */
export async function setCampaignAccessPassword(id: string, password: string | null): Promise<void> {
  const accessPasswordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
  await prisma.campaign.update({ where: { id }, data: { accessPasswordHash } });
}

/** True only for a campaign that both requires a password and has that exact password. A password-access campaign with no hash set yet (Ola turned on "Password" but hasn't set one) never unlocks — fails closed, not open. */
export async function verifyCampaignAccessPassword(id: string, password: string): Promise<boolean> {
  const row = await prisma.campaign.findUnique({ where: { id }, select: { accessPasswordHash: true } });
  if (!row?.accessPasswordHash) return false;
  return bcrypt.compare(password, row.accessPasswordHash);
}
