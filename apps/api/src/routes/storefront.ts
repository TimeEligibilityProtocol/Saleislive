import { Router } from "express";
import { requireBrand } from "../middleware/tenantRouter.js";

/** What the storefront app calls on load to find out which brand it's rendering, resolved from the request's Host header. */
export function storefrontRouter(): Router {
  const router = Router();
  router.get("/api/storefront/me", requireBrand, (req, res) => {
    res.json({ brand: req.brand });
  });
  return router;
}
