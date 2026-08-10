import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireBrand } from "../middleware/tenantRouter.js";
import { listProductsForBrand } from "../store/products.js";

/** What the storefront app calls on load to find out which brand it's rendering, resolved from the request's Host header. */
export function storefrontRouter(): Router {
  const router = Router();
  router.get("/api/storefront/me", requireBrand, (req, res) => {
    res.json({ brand: req.brand });
  });
  router.get(
    "/api/storefront/products",
    requireBrand,
    asyncHandler(async (req, res) => {
      res.json({ products: await listProductsForBrand(req.brand!.id) });
    }),
  );
  return router;
}
