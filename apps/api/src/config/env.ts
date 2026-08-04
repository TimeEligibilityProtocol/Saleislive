export interface Env {
  nodeEnv: "development" | "production" | "test";
  port: number;
  /** e.g. "saleis.live" locally aliased via /etc/hosts or "localhost" in dev — the tenant router strips this suffix to find the brand slug. */
  platformRootDomain: string;
  /**
   * Fallback brand slug used only when the request's Host header doesn't
   * match platformRootDomain at all — e.g. a Render preview URL like
   * saleislive-api.onrender.com, before real wildcard DNS for
   * *.saleis.live is wired up. Unset in real per-brand-subdomain hosting.
   */
  defaultBrandSlug: string | null;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    nodeEnv: (source.NODE_ENV as Env["nodeEnv"]) ?? "development",
    port: Number(source.PORT ?? 4100),
    platformRootDomain: source.PLATFORM_ROOT_DOMAIN ?? "localhost",
    defaultBrandSlug: source.DEFAULT_BRAND_SLUG ?? null,
  };
}
