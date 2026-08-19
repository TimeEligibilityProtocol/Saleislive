import { ThemePresetId } from "./theme.js";

/** A live sale — see blueprint §3 and §9. Products are attached by id; a campaign never owns its own product copies. */
export type CampaignAccess = "public" | "private" | "invite" | "password";
export type CampaignStatus = "draft" | "scheduled" | "live" | "ended" | "canceled";

/**
 * A few ready-made hero colour pairings (background/text) — not a free
 * colour picker, so every sale's hero still reads as "on-brand for
 * saleis.live" rather than an arbitrary hex value. Ola, 2026-08-12: "pare
 * kolorow... najbardziej popularne", so these lean on well-worn
 * fashion-retail hero looks rather than anything exotic.
 */
export const HERO_COLOR_PRESETS = {
  ivory: { label: "Ivory", background: "#F5F2EB", text: "#111111" },
  charcoal: { label: "Charcoal", background: "#111111", text: "#F5F2EB" },
  blush: { label: "Blush", background: "#F3E4E0", text: "#3A2A26" },
  navy: { label: "Navy", background: "#173B8F", text: "#FFFFFF" },
} as const;
export type HeroColorPresetId = keyof typeof HERO_COLOR_PRESETS;

/** Headline size — "medium" matches the hero's original fixed size (88px desktop / 40px mobile), so a sale that never touches this looks exactly as before. Same preset drives both breakpoints together, not set independently, per Ola's ask that a size choice hold consistently on the phone too. */
export const HERO_TITLE_SIZE_PX = {
  small: { desktop: 64, mobile: 32 },
  medium: { desktop: 88, mobile: 40 },
  large: { desktop: 112, mobile: 52 },
} as const;
export type HeroTitleSizeId = keyof typeof HERO_TITLE_SIZE_PX;

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
  /** Null means "use the platform default" (ivory bg / Instrument Serif) — these only apply to this sale's own hero, not the whole brand. */
  heroColorPreset: HeroColorPresetId | null;
  heroFontPreset: string | null;
  heroTitleSize: HeroTitleSizeId | null;
  /** Whether a password is currently set for `access: "password"` — never the password/hash itself, just enough for the admin UI to show "Password set" vs "No password yet" without round-tripping anything secret. */
  hasAccessPassword: boolean;
  createdAt: string;
}
