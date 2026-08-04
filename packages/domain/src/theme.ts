/**
 * Per-brand storefront theme — data, never code. See blueprint §6:
 * "W MVP wdrażamy Theme Studio oparte na tokenach i gotowych
 * komponentach. Nie importujemy dowolnego projektu jako niekontrolowanego
 * kodu." A brand's ThemeTokens selects among approved presets/fonts and
 * sets brand colors; it never contains HTML/CSS/JS.
 */

export type ThemePresetId = "editorial" | "minimal" | "high_density";

export const THEME_PRESETS: ThemePresetId[] = ["editorial", "minimal", "high_density"];

/** Fonts a brand may choose are drawn from this fixed, licensed list — never an arbitrary upload. */
export const APPROVED_FONTS = ["Inter", "Instrument Serif", "Playfair Display", "Manrope", "Space Grotesk"] as const;
export type ApprovedFont = (typeof APPROVED_FONTS)[number];

export interface ThemeTokens {
  brandId: string;
  preset: ThemePresetId;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: ApprovedFont;
  cornerRadius: "sharp" | "soft" | "round";
  logoUrl: string | null;
  heroImageUrl: string | null;
}

export function defaultThemeTokens(brandId: string): ThemeTokens {
  return {
    brandId,
    preset: "minimal",
    primaryColor: "#111111",
    accentColor: "#173B8F",
    backgroundColor: "#F5F2EB",
    textColor: "#111111",
    fontFamily: "Inter",
    cornerRadius: "soft",
    logoUrl: null,
    heroImageUrl: null,
  };
}
