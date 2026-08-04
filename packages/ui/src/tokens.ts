/**
 * Platform chrome tokens — the Saleis.live brand itself (marketing site,
 * admin shell, "Powered by saleis.live" footer). NOT the per-tenant
 * storefront theme, which is data-driven (see @saleis-live/domain's
 * ThemeTokens) so each brand can look different while the platform
 * chrome around it stays consistent. Source: saleis-live-visual-brand-kit.
 */
export const colors = {
  ink: "#111111",
  ivory: "#F5F2EB",
  white: "#FFFFFF",
  stone: "#D8D4CC",
  ultramarine: "#173B8F",
  text: "#111111",
  background: "#F5F2EB",
  surface: "#FFFFFF",
  border: "#D8D4CC",
};

export const typography = {
  fontFamily: {
    ui: "Inter, 'Neue Haas Grotesk', system-ui, sans-serif",
    display: "'Instrument Serif', Georgia, serif",
  },
  weights: {
    body: "400",
    bodyMedium: "500",
    heading: "600",
    button: "600",
  },
};

export const radii = {
  card: 12,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
