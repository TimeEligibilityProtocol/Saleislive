import { Router } from "express";
import { listAllProductsForBrand } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

/** Admin/catalogue view — every product status, unlike the public storefront route which only returns "active". */
export function adminProductsRouter(): Router {
  const router = Router();

  router.get("/api/brands/:brandId/products", (req, res) => {
    const brand = getBrandById(req.params.brandId);
    if (!brand) return res.status(404).json({ error: "unknown_brand" });
    res.json({ products: listAllProductsForBrand(brand.id) });
  });

  return router;
}
