export interface Env {
  nodeEnv: "development" | "production" | "test";
  port: number;
  /** e.g. "saleis.live" locally aliased via /etc/hosts or "localhost" in dev — the tenant router strips this suffix to find the brand slug. */
  platformRootDomain: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    nodeEnv: (source.NODE_ENV as Env["nodeEnv"]) ?? "development",
    port: Number(source.PORT ?? 4100),
    platformRootDomain: source.PLATFORM_ROOT_DOMAIN ?? "localhost",
  };
}
