import cors from "cors";
import "dotenv/config";
import express from "express";
import { loadEnv } from "./config/env.js";
import { tenantRouter } from "./middleware/tenantRouter.js";
import { brandsRouter } from "./routes/brands.js";
import { healthRouter } from "./routes/health.js";
import { storefrontRouter } from "./routes/storefront.js";

const env = loadEnv();

const app = express();
app.use(cors());
app.use(express.json());
app.use(tenantRouter(env.platformRootDomain));
app.use(healthRouter());
app.use(brandsRouter());
app.use(storefrontRouter());

app.listen(env.port, "0.0.0.0", () => {
  console.log(`saleis.live api listening on :${env.port} (${env.nodeEnv})`);
});
