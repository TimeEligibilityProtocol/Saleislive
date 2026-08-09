import { ThemePresetId } from "./theme.js";

/** A live sale — see blueprint §3 and §9. Products are attached by id; a campaign never owns its own product copies. */
export type CampaignAccess = "public" | "private" | "invite" | "password";
export type CampaignStatus = "draft" | "scheduled" | "live" | "ended" | "canceled";

export interface Campaign {
  id: string;
  tenantId: string;
  brandId: string;
  name: string;
  /** Path or full custom address — see blueprint §3 subdomain table (e.g. "chanel.saleis.live/private-48h"). */
  slug: string;
  access: CampaignAccess;
  status: CampaignStatus;
  productIds: string[];
  startsAt: string;
  endsAt: string | null;
  /** Screen 06 "Store" tab — this sale's own landing copy/hero, distinct from the brand's persistent identity (logo/base colours live on Brand, not here). */
  headline: string;
  shortDescription: string;
  heroDesktopUrl: string | null;
  heroMobileUrl: string | null;
  themePreset: ThemePresetId;
  createdAt: string;
}
