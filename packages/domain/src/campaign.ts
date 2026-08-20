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

/**
 * Given a background hex colour, returns the readable text colour (near-
 * black or white) against it — WCAG relative-luminance threshold, same
 * idea as the hero CTA's old "invert the preset's own pair" trick but
 * works for any arbitrary colour a merchant picks with a colour input,
 * not just the 4 curated presets. Used everywhere a merchant sets a free
 * colour (hero, hero button, add-to-bag button, product-area background)
 * so a colour choice can never produce invisible text — the exact bug
 * class that bit the hero CTA, 2026-08-18.
 */
export function contrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.45 ? "#111111" : "#FFFFFF";
}

/**
 * Curated list of real, popular Google Fonts families — the "search and
 * pick any font, like in Word" Ola asked for (2026-08-18), beyond the 5
 * self-hosted APPROVED_FONTS. Loaded on demand via Google Fonts' CSS2 API
 * (see googleFontCssUrl) rather than self-hosted, since bundling hundreds
 * of font files isn't practical — only ever used for a hero headline a
 * merchant explicitly picked, so a slow/blocked font request degrades to
 * a system-font fallback on that one headline, not a silent site-wide
 * failure.
 */
export const GOOGLE_FONT_FAMILIES = [
  "Abril Fatface", "Alegreya", "Archivo", "Archivo Black", "Arvo", "Assistant", "Barlow", "Barlow Condensed",
  "Baskervville", "Bebas Neue", "Bitter", "Bodoni Moda", "Bricolage Grotesque", "Cabin", "Caveat", "Cinzel",
  "Cormorant", "Cormorant Garamond", "Crimson Pro", "Crimson Text", "DM Sans", "DM Serif Display", "DM Serif Text",
  "Domine", "EB Garamond", "Eczar", "Epilogue", "Fjalla One", "Fraunces", "Frank Ruhl Libre", "Georama", "Georgia Pro",
  "Gloock", "Grenze Gotisch", "Halant", "Hanken Grotesk", "Ibarra Real Nova", "Inconsolata", "Inknut Antiqua",
  "Instrument Sans", "Jost", "Josefin Sans", "Josefin Slab", "Karla", "Kanit", "Lato", "Lexend", "Libre Baskerville",
  "Libre Caslon Display", "Libre Caslon Text", "Libre Franklin", "Literata", "Lora", "Marcellus", "Merriweather",
  "Montserrat", "Mulish", "Newsreader", "Noto Serif", "Nunito", "Old Standard TT", "Oswald", "Outfit", "Overpass",
  "Petrona", "Piazzolla", "Playfair", "Plus Jakarta Sans", "Poppins", "Prata", "PT Sans", "PT Serif", "Public Sans",
  "Quattrocento", "Quicksand", "Rajdhani", "Raleway", "Red Hat Display", "Red Hat Text", "Roboto", "Roboto Condensed",
  "Roboto Serif", "Rubik", "Sora", "Source Sans 3", "Source Serif 4", "Spectral", "Syne", "Tenor Sans", "Urbanist",
  "Vollkorn", "Work Sans", "Yeseva One", "Zilla Slab",
] as const;

/** Google Fonts' CSS2 API, requesting the specific weights the storefront/admin actually use (400 body, 500/600/700 headings/buttons) — swap-on-load so text is never invisible while the font downloads. */
export function googleFontCssUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
}

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
  /**
   * False/null (default) = the uploaded photo sits positioned/scaled in
   * the hero's free space beside the headline (drag-to-move/resize).
   * True = a different mode — a complete, pre-made hero design uploaded
   * at the exact recommended size (1920×1080 desktop / 1080×1350
   * mobile), rendered full-bleed behind the headline instead. Position
   * isn't draggable in this mode — Ola, 2026-08-19: "jak wiadomo jaka
   * rozdzielczość i jest wgrywany na całą szerokość to chyba jasne że
   * nie powinien [być przeciągalny]". Doesn't replace the colour/font
   * settings below — headline colour, font, size, and the CTA
   * toggle/colour all still apply on top of this image exactly as they
   * do in the other two hero modes ("w kolorach nagłówka ludzie
   * ustawiają, rozumiesz?").
   */
  heroImageFullBleed: boolean | null;
  themePreset: ThemePresetId;
  /** Null means "use the platform default" (ivory bg / Instrument Serif) — these only apply to this sale's own hero, not the whole brand. */
  heroColorPreset: HeroColorPresetId | null;
  heroFontPreset: string | null;
  heroTitleSize: HeroTitleSizeId | null;
  /**
   * Free hex colour picker for the hero background — takes priority over
   * heroColorPreset when set (mutually exclusive in the admin UI: picking
   * one clears the other). Text colour is derived automatically via
   * contrastTextColor, never a second field to set, so a colour choice
   * can't accidentally produce invisible text. Ola, 2026-08-19: "w
   * zasadzie wszędzie od strony admin" — full colour control, not just
   * the 4 curated presets.
   */
  heroCustomColor: string | null;
  /** Explicit override for the hero headline/subtext colour — Ola, 2026-08-19, asked for this as its own field alongside every other "font colour" in the panel. Null = the existing safe default (contrastTextColor against whatever hero background is active). Set deliberately: an override here is NOT contrast-checked against the hero background, so a bad combination is possible if chosen on purpose. */
  heroTextColor: string | null;
  /** Free hex colour for the hero's "Shop the sale" button — independent of the hero background colour (Ola: "nie może być jedno"). Null = the existing default (invert the active hero colour, or navy). */
  heroButtonColor: string | null;
  /** Explicit override for the hero button's own text colour. Null = contrastTextColor against heroButtonColor (or the hero's own inverted pair when heroButtonColor is also unset). */
  heroButtonTextColor: string | null;
  /** Free hex colour for every "Add to bag" / primary action button across the storefront (product card, product detail, checkout, confirmation) — one shared colour, since they're all the same button role. Null = platform default navy. */
  buyButtonColor: string | null;
  /** Explicit override for the "Add to bag" button's own text colour. Null = contrastTextColor against buyButtonColor, or white against the platform default navy. */
  buyButtonTextColor: string | null;
  /** Free hex colour for the page area behind the product grid (category pills through the product cards) — independent of the hero background. Null = platform default ivory. Set once at the page root (App.tsx), so it's identical on every route — home, product detail, bag, checkout — never just the home grid. Ola, 2026-08-19: "musi się zmieniać wszędzie w sklepie... żeby nie było takiej sytuacji że inny jest w koszyku, inny jak klikamy na produkt". */
  productAreaBackgroundColor: string | null;
  /** Free hex colour for the header bar (behind the logo/bag link) — independent of the hero and product-area colours. Null = platform default white. Ola, 2026-08-19: "kolor tego paska na którym jest logo tez musi być zmienialny". */
  headerBackgroundColor: string | null;
  /**
   * Free hex colour for ordinary body text site-wide — product names/
   * prices on the grid, the same product's title/price/detail labels on
   * its own page, bag line items. Set once at the page root (same
   * mechanism as productAreaBackgroundColor) so it can never drift
   * between the card and the detail view — Ola, 2026-08-19: "jak się
   * kliknie na produkt to musi być ten sam kolor opisu później". Null =
   * platform default near-black. Secondary/muted labels (SKU, policy
   * text) intentionally keep their own muted tone regardless — this only
   * covers primary body text.
   */
  bodyTextColor: string | null;
  /** Null/true = show the platform's own "Shop the sale" CTA over the hero. False = hide it — a merchant whose uploaded hero photo already has its own call-to-action baked in doesn't want a second, redundant one on top. */
  showHeroCta: boolean | null;
  /**
   * Where the hero photo and the headline/copy/CTA text block sit within
   * the hero canvas — drag-to-move, drag-the-dot-to-resize (image only;
   * text size comes from heroTitleSize), same fraction-of-canvas (0-1)
   * convention as product photo composite positioning. Desktop and mobile
   * are positioned independently — Ola, 2026-08-19: what reads well as
   * image-beside-text on a wide canvas often needs a different
   * arrangement on a tall phone strip. Null = today's existing fixed
   * layout (image full-bleed behind negative-space text).
   */
  heroImageOffsetX: number | null;
  heroImageOffsetY: number | null;
  heroImageScale: number | null;
  /**
   * Headline's own position + width — independent of the description and
   * the CTA button, each of which has its own position below. Ola,
   * 2026-08-19, rejecting the earlier one-block-moves-together design:
   * "nie zależy mi na czymś co można przesunąć jako całość, ta funkcja
   * jest bez sensu" — each of the three needs to move (and the headline/
   * description also resize their own FONT SIZE) on its own. Scale is a
   * multiplier on the base size (heroTitleSize's px for the headline, a
   * fixed base for the description) — dragging the resize dot makes the
   * text itself bigger/smaller, same as resizing a text box in Figma/
   * Canva, which is also the most reliable way to force long copy onto
   * one line. Ola, 2026-08-19, after box-width-only resize didn't do
   * what she meant: "czy da się zmniejszyć, powiększyć czcionkę? ...
   * po rozciągnięciu na szerokość nadal jest w dwóch [liniach]".
   */
  heroTextOffsetX: number | null;
  heroTextOffsetY: number | null;
  heroTextScale: number | null;
  heroDescriptionOffsetX: number | null;
  heroDescriptionOffsetY: number | null;
  heroDescriptionScale: number | null;
  heroCtaOffsetX: number | null;
  heroCtaOffsetY: number | null;
  heroImageOffsetXMobile: number | null;
  heroImageOffsetYMobile: number | null;
  heroImageScaleMobile: number | null;
  /** Mobile still positions the headline/description/CTA as a single combined block (today's original design) — the three-independent-elements model above is desktop-only for now, since mobile live-editing on the storefront doesn't work yet either (see the storefront's own isMobileViewport comment). */
  heroTextOffsetXMobile: number | null;
  heroTextOffsetYMobile: number | null;
  /** Whether a password is currently set for `access: "password"` — never the password/hash itself, just enough for the admin UI to show "Password set" vs "No password yet" without round-tripping anything secret. */
  hasAccessPassword: boolean;
  createdAt: string;
}
