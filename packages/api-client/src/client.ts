import { Brand, Campaign, DeliveryMethod, ImportBatch, IntakeMethod, MatchMethod, Order, ParsedImportRow, PhotoTreatment, Product } from "@saleis-live/domain";

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null>;
  /**
   * Explicit brand slug to send as X-Brand-Slug — lets the storefront
   * resolve a brand via ?brand=slug when it isn't actually running on
   * that brand's real subdomain (e.g. a shared Render preview URL before
   * wildcard DNS for *.saleis.live exists). Ignored server-side once a
   * real Host-header subdomain match is found.
   */
  brandSlug?: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Mirrors apps/api's ColumnMapping — kept here rather than in @saleis-live/domain since it's a parsing-layer concern, not a business object. */
export interface ImportColumnMapping {
  fields: Partial<Record<keyof ParsedImportRow, string>>;
  missingRequired: (keyof ParsedImportRow)[];
  unmappedHeaders: string[];
}

export interface ImportPreview {
  headers: string[];
  mapping: ImportColumnMapping;
  rowCount: number;
  exampleRow: Record<string, string>;
}

export interface ProductPhotoAnalysis {
  color: string;
  material: string;
  category: string;
  description: string;
}

export class ApiClient {
  constructor(private config: ApiClientConfig) {}

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.config.getAuthToken?.();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (this.config.brandSlug) headers["X-Brand-Slug"] = this.config.brandSlug;

    const res = await fetch(`${this.config.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  health(): Promise<{ status: string }> {
    return this.request("/health");
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    const { available } = await this.request<{ available: boolean }>(`/api/brands/slug-available?slug=${encodeURIComponent(slug)}`);
    return available;
  }

  async getBrand(brandId: string): Promise<Brand> {
    const { brand } = await this.request<{ brand: Brand }>(`/api/brands/${brandId}`);
    return brand;
  }

  async createBrand(input: { tenantId: string; name: string; slug: string; country: string; currency: string; language: string; secondaryLanguage?: string | null }): Promise<Brand> {
    const { brand } = await this.request<{ brand: Brand }>("/api/brands", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return brand;
  }

  async getCurrentStorefrontBrand(): Promise<Brand> {
    const { brand } = await this.request<{ brand: Brand }>("/api/storefront/me");
    return brand;
  }

  async listStorefrontProducts(): Promise<Product[]> {
    const { products } = await this.request<{ products: Product[] }>("/api/storefront/products");
    return products;
  }

  resolveAssetUrl(relativeUrl: string): string {
    return `${this.config.baseUrl}${relativeUrl}`;
  }

  /** Screen 03 — parses the file and returns just the column mapping to review/override; stages nothing. */
  async previewImport(file: File): Promise<ImportPreview> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${this.config.baseUrl}/api/imports/preview`, { method: "POST", body: form });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<ImportPreview>;
  }

  /** Stage a file — parses it and returns a row-by-row diff, but writes nothing yet. */
  async uploadImport(
    brandId: string,
    file: File,
    opts?: { intakeMethod?: IntakeMethod; photoTreatment?: PhotoTreatment[]; matchMethod?: MatchMethod; fieldOverrides?: Partial<Record<string, keyof ParsedImportRow>> },
  ): Promise<{ batch: ImportBatch }> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    form.append("brandId", brandId);
    form.append("file", file);
    if (opts?.intakeMethod) form.append("intakeMethod", opts.intakeMethod);
    if (opts?.matchMethod) form.append("matchMethod", opts.matchMethod);
    for (const treatment of opts?.photoTreatment ?? []) form.append("photoTreatment", treatment);
    if (opts?.fieldOverrides && Object.keys(opts.fieldOverrides).length > 0) form.append("fieldOverrides", JSON.stringify(opts.fieldOverrides));
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.config.baseUrl}/api/imports`, { method: "POST", body: form, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text);
    }
    return res.json() as Promise<{ batch: ImportBatch }>;
  }

  async commitImport(batchId: string): Promise<{ batch: ImportBatch; summary: { created: number; updated: number; skipped: number } }> {
    return this.request(`/api/imports/${batchId}/commit`, { method: "POST" });
  }

  async listBrandProducts(brandId: string): Promise<Product[]> {
    const { products } = await this.request<{ products: Product[] }>(`/api/brands/${brandId}/products`);
    return products;
  }

  /** Records a screen-02 intake choice that has no file yet (product photos, ZIP, etc.) — see the route's doc comment. */
  async recordIntakeIntent(brandId: string, opts: { intakeMethod: IntakeMethod; matchMethod: MatchMethod; photoTreatment: PhotoTreatment[] }): Promise<{ batch: ImportBatch }> {
    return this.request("/api/imports/intent", { method: "POST", body: JSON.stringify({ brandId, ...opts }) });
  }

  async createManualProduct(brandId: string, row: ParsedImportRow): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/manual`, {
      method: "POST",
      body: JSON.stringify(row),
    });
    return product;
  }

  async getProduct(brandId: string, id: string): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}`);
    return product;
  }

  /** Screen 05 (Product Studio). `approve: true` also publishes the product to the storefront. */
  async updateProduct(
    brandId: string,
    id: string,
    patch: Partial<{ name: string; description: string; category: string; color: string; material: string; price: number; salePrice: number; stock: number; approve: boolean }>,
  ): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return product;
  }

  /** Product Studio's "Suggest with AI" — fetches the product's own image and sends it for real vision analysis. Throws ApiError(503) if ANTHROPIC_API_KEY isn't configured server-side. */
  async analyzeProductPhoto(imageUrl: string): Promise<ProductPhotoAnalysis> {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new ApiError(imageRes.status, "Couldn't load the product image.");
    const blob = await imageRes.blob();
    const form = new FormData();
    form.append("photo", blob, "photo.jpg");
    const res = await fetch(`${this.config.baseUrl}/api/products/analyze-photo`, { method: "POST", body: form });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<ProductPhotoAnalysis>;
  }

  /** Screen 06 (Launch Studio) — one sale-in-progress per brand for MVP; auto-creates a draft on first visit. */
  async getCurrentCampaign(brandId: string): Promise<Campaign> {
    const { campaign } = await this.request<{ campaign: Campaign }>(`/api/brands/${brandId}/campaign`);
    return campaign;
  }

  async updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "tenantId" | "brandId" | "createdAt">>): Promise<Campaign> {
    const { campaign } = await this.request<{ campaign: Campaign }>(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    return campaign;
  }

  async updateBrandPolicies(brandId: string, patch: Partial<{ returnPolicy: string; shippingPolicy: string }>): Promise<Brand> {
    const { brand } = await this.request<{ brand: Brand }>(`/api/brands/${brandId}/policies`, { method: "PATCH", body: JSON.stringify(patch) });
    return brand;
  }

  /** Screen 06's Payments/Delivery tabs — "bring your own integration". Pass null to disconnect. */
  async updateBrandIntegration(brandId: string, kind: "payment" | "delivery", patch: { endpointUrl: string; apiKey: string } | null): Promise<Brand> {
    const { brand } = await this.request<{ brand: Brand }>(`/api/brands/${brandId}/integrations/${kind}`, {
      method: "PATCH",
      body: JSON.stringify(patch === null ? { disconnect: true } : patch),
    });
    return brand;
  }

  /** Screens 09-10 (Orders, Order Detail). */
  async listOrders(brandId: string): Promise<Order[]> {
    const { orders } = await this.request<{ orders: Order[] }>(`/api/brands/${brandId}/orders`);
    return orders;
  }

  async getOrder(id: string): Promise<Order> {
    const { order } = await this.request<{ order: Order }>(`/api/orders/${id}`);
    return order;
  }

  async advanceOrderFulfilment(id: string): Promise<Order> {
    const { order } = await this.request<{ order: Order }>(`/api/orders/${id}/advance-fulfilment`, { method: "POST" });
    return order;
  }

  async refundOrder(id: string): Promise<Order> {
    const { order } = await this.request<{ order: Order }>(`/api/orders/${id}/refund`, { method: "POST" });
    return order;
  }

  async cancelOrder(id: string): Promise<Order> {
    const { order } = await this.request<{ order: Order }>(`/api/orders/${id}/cancel`, { method: "POST" });
    return order;
  }

  /**
   * Storefront's checkout — always creates a real Order. If the brand has
   * a real payment integration connected, checkoutUrl comes back non-null
   * and the caller should redirect the buyer there instead of using
   * confirmTestPayment. See routes/checkout.ts's doc comment.
   */
  async startCheckout(input: {
    brandId: string;
    items: { productId: string; quantity: number }[];
    customerName: string;
    customerPhone: string;
    customerLocation: string;
    deliveryMethod: DeliveryMethod;
    returnUrl?: string;
  }): Promise<{ order: Order; checkoutUrl?: string }> {
    return this.request<{ order: Order; checkoutUrl?: string }>("/api/checkout/start", { method: "POST", body: JSON.stringify(input) });
  }

  async confirmTestPayment(orderId: string): Promise<Order> {
    const { order } = await this.request<{ order: Order }>(`/api/checkout/${orderId}/confirm-test-payment`, { method: "POST" });
    return order;
  }
}
