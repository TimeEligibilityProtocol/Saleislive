import { Campaign } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";

/** In-memory only, same pragmatic starting point as the other stores. */
let campaigns: Campaign[] = [];

export function listCampaignsForBrand(brandId: string): Campaign[] {
  return campaigns.filter((c) => c.brandId === brandId);
}

export function getCampaignById(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id);
}

/**
 * Screen 06 (Launch Studio) assumes one sale in progress per brand at a
 * time for MVP — a full campaign list/switcher is later scope. Returns
 * the brand's first campaign, creating an empty draft one on first visit.
 */
export function getOrCreateCurrentCampaign(tenantId: string, brandId: string): Campaign {
  const existing = campaigns.find((c) => c.brandId === brandId);
  if (existing) return existing;
  const campaign: Campaign = {
    id: `camp_${randomUUID()}`,
    tenantId,
    brandId,
    name: "",
    slug: "",
    access: "public",
    status: "draft",
    productIds: [],
    startsAt: new Date().toISOString(),
    endsAt: null,
    headline: "",
    shortDescription: "",
    heroDesktopUrl: null,
    heroMobileUrl: null,
    themePreset: "editorial",
    createdAt: new Date().toISOString(),
  };
  campaigns = [...campaigns, campaign];
  return campaign;
}

export function updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "tenantId" | "brandId" | "createdAt">>): Campaign | undefined {
  const campaign = getCampaignById(id);
  if (!campaign) return undefined;
  Object.assign(campaign, patch);
  return campaign;
}
