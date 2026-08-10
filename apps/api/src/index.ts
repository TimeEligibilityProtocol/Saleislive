import cors from "cors";
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./config/env.js";
import { UPLOADS_DIR } from "./lib/assetStorage.js";
import { tenantRouter } from "./middleware/tenantRouter.js";
import { analyzeProductRouter, createAnthropicClient } from "./routes/analyzeProduct.js";
import { authRouter } from "./routes/auth.js";
import { brandsRouter } from "./routes/brands.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { checkoutRouter } from "./routes/checkout.js";
import { healthRouter } from "./routes/health.js";
import { importsRouter } from "./routes/imports.js";
import { ordersRouter } from "./routes/orders.js";
import { adminProductsRouter } from "./routes/products.js";
import { setupStepsRouter } from "./routes/setupSteps.js";
import { storefrontRouter } from "./routes/storefront.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { ensureSeedData as ensureTenantSeed } from "./store/tenants.js";
import { ensureSeedData as ensureProductSeed } from "./store/products.js";
import { ensureSeedData as ensureOrderSeed } from "./store/orders.js";
import { ensureSeedData as ensureUserSeed } from "./store/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv();

async function main() {
  // Order matters: brand before products/users (FK), products before orders (order lines reference product SKUs, not enforced as FK but seeded for consistency), brand+products before orders (orders need a real Campaign row).
  await ensureTenantSeed();
  await ensureProductSeed();
  await ensureOrderSeed();
  await ensureUserSeed();

  const app = express();
  app.use(cors());
  app.use(express.json());
  // Uploaded/generated images (imports, Product Studio photos, cutouts) —
  // mounted BEFORE the general /assets fallback below, and pointed at
  // UPLOADS_DIR specifically (a Render Persistent Disk in production, set
  // via the UPLOADS_DIR env var) so they survive redeploys instead of
  // living in the container's own throwaway filesystem.
  app.use("/assets/uploads", express.static(UPLOADS_DIR));
  app.use("/assets", express.static(path.join(__dirname, "..", "public", "assets")));
  app.use(tenantRouter(env.platformRootDomain, env.defaultBrandSlug));
  app.use(healthRouter());
  app.use(authRouter());
  app.use(setupStepsRouter());
  app.use(brandsRouter());
  app.use(storefrontRouter());
  const anthropicClient = createAnthropicClient(env.anthropicApiKey);
  app.use(importsRouter(anthropicClient));
  app.use(adminProductsRouter(anthropicClient));
  app.use(analyzeProductRouter(env.anthropicApiKey));
  app.use(campaignsRouter());
  app.use(ordersRouter());
  app.use(checkoutRouter());
  app.use(webhooksRouter());

  app.listen(env.port, "0.0.0.0", () => {
    console.log(`saleis.live api listening on :${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
