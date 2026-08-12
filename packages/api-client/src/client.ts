import { Brand, BrandMembership, Campaign, DeliveryMethod, ImportBatch, IntakeMethod, MatchMethod, Order, ParsedImportRow, PhotoTreatment, Product, Role, User } from "@saleis-live/domain";

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

/** Mirrors apps/api's BackgroundPresetMeta (backgroundRemoval.ts) — lets the picker show real swatches/thumbnails instead of a text-only dropdown. */
export type BackgroundPresetMeta = { key: string; kind: "color"; color: string } | { key: string; kind: "image"; thumbnailUrl: string };

/** Mirrors apps/api's Prisma enums as plain string unions — API-response shapes, not domain objects, same reasoning as ImportColumnMapping above. */
export type SetupStepKey = "brand_setup" | "stock_intake" | "ai_catalogue_review" | "launch_setup" | "preview_publish";
export type SetupStepStatus = "not_started" | "in_progress" | "submitted" | "approved" | "rejected";

/** Mirrors apps/api's TeamMemberView (memberships.ts) — a BrandMembership joined with the user's email/display name. */
export interface TeamMemberView {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

/** Mirrors apps/api's AuditLogEntry (auditLog.ts). */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
}

export interface SetupStepView {
  stepKey: SetupStepKey;
  status: SetupStepStatus;
  submittedByUserId: string | null;
  submittedAt: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  note: string | null;
  unlocked: boolean;
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

  /** 403s server-side unless the caller is brand_admin/group_owner. Never touches the slug — storefront URLs already depend on it. */
  async updateBrand(brandId: string, input: { name: string; country: string; currency: string; language: string; secondaryLanguage: string | null }): Promise<Brand> {
    const { brand } = await this.request<{ brand: Brand }>(`/api/brands/${brandId}`, { method: "PATCH", body: JSON.stringify(input) });
    return brand;
  }

  /**
   * `previewing` is true only when this request carries a valid session for
   * a member of this exact brand — see apps/api/src/routes/storefront.ts's
   * isPreviewAuthorized. Lets the storefront show a "coming soon" page to
   * real visitors while still letting the brand owner see their own
   * unpublished store. `locked` is true when the current sale is
   * password-protected and this visitor hasn't unlocked it yet (see
   * unlockStorefrontAccess) — the storefront should show a password gate
   * instead of calling listStorefrontProducts/getCurrentStorefrontCampaign,
   * both of which 401 while locked.
   */
  async getCurrentStorefrontBrand(): Promise<{ brand: Brand; previewing: boolean; access: Campaign["access"]; locked: boolean }> {
    return this.request<{ brand: Brand; previewing: boolean; access: Campaign["access"]; locked: boolean }>("/api/storefront/me");
  }

  /** The password for a "password"-access sale, checked against the hash set via updateCampaign's accessPassword field. On success, the returned token unlocks listStorefrontProducts/getCurrentStorefrontCampaign for ~30 days — the caller is responsible for storing it and threading it back through getAuthToken. */
  async unlockStorefrontAccess(password: string): Promise<{ token: string }> {
    return this.request<{ token: string }>("/api/storefront/unlock", { method: "POST", body: JSON.stringify({ password }) });
  }

  async listStorefrontProducts(): Promise<Product[]> {
    const { products } = await this.request<{ products: Product[] }>("/api/storefront/products");
    return products;
  }

  /** Launch Studio's "Store" tab hero fields (headline, image, colour, font) — this is what actually renders them on the real storefront. */
  async getCurrentStorefrontCampaign(): Promise<Campaign> {
    const { campaign } = await this.request<{ campaign: Campaign }>("/api/storefront/campaign");
    return campaign;
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

  /** "Wrong file uploaded by mistake" — undoes a committed batch: deletes rows it added, reverts fields on rows it updated. See the route's own doc comment for exactly what it does and doesn't touch (images are left alone). */
  async rollbackImportBatch(batchId: string): Promise<{ batch: ImportBatch; summary: { deleted: number; reverted: number } }> {
    return this.request(`/api/imports/${batchId}/rollback`, { method: "POST" });
  }

  /** Recent import batches for a brand, newest first — so a merchant can find the one to roll back without knowing its id. */
  async listImportBatches(brandId: string): Promise<ImportBatch[]> {
    const { batches } = await this.request<{ batches: ImportBatch[] }>(`/api/brands/${brandId}/imports`);
    return batches;
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

  /** Catalogue Center's "Delete" — permanent, single-item removal (distinct from rollbackImportBatch, which undoes a whole import). */
  async deleteProduct(brandId: string, id: string): Promise<void> {
    await this.request(`/api/brands/${brandId}/products/${id}`, { method: "DELETE" });
  }

  /** Screen 05 (Product Studio) — the server re-derives `status` from whether the saved result is actually catalogue-complete (see isCatalogueReady), so there's no separate publish flag to pass here. */
  async updateProduct(
    brandId: string,
    id: string,
    patch: Partial<{ name: string; description: string; category: string; color: string; size: string; material: string; dimensions: string; price: number; salePrice: number; stock: number }>,
  ): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return product;
  }

  /** Product Studio's "add another photo" — appends, never replaces; becomes the main photo only if the product had none before. Raw fetch, not this.request(): a FormData body needs the browser's own multipart Content-Type/boundary, not the JSON one request() always sets. */
  async addProductImage(brandId: string, id: string, file: File): Promise<Product> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.config.baseUrl}/api/brands/${brandId}/products/${id}/images`, { method: "POST", body: form, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    const { product } = (await res.json()) as { product: Product };
    return product;
  }

  /** "Product photos" / "phone camera" intake — no spreadsheet, just photos. Each file becomes its own draft product with AI-filled details; price/stock still need a human afterward. */
  async createProductsFromPhotos(brandId: string, files: File[]): Promise<Product[]> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.config.baseUrl}/api/brands/${brandId}/products/from-photos`, { method: "POST", body: form, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    const { products } = (await res.json()) as { products: Product[] };
    return products;
  }

  async setMainProductImage(brandId: string, id: string, url: string): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}/images/main`, { method: "PATCH", body: JSON.stringify({ url }) });
    return product;
  }

  /** Refuses (409) if this is the product's only remaining photo. */
  async removeProductImage(brandId: string, id: string, url: string): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}/images`, { method: "DELETE", body: JSON.stringify({ url }) });
    return product;
  }

  /** Real local background removal (no external API) — adds the cutout as a new photo. Throws ApiError(422) if the model couldn't find a product in the image. */
  async removeImageBackground(brandId: string, id: string, url: string): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}/images/remove-background`, { method: "POST", body: JSON.stringify({ url }) });
    return product;
  }

  async applyBackgroundPreset(
    brandId: string,
    id: string,
    url: string,
    preset: string | null,
    options?: { offsetX?: number; offsetY?: number; scale?: number; customBackgroundUrl?: string },
  ): Promise<Product> {
    const { product } = await this.request<{ product: Product }>(`/api/brands/${brandId}/products/${id}/images/apply-background`, {
      method: "POST",
      body: JSON.stringify({ url, preset, ...options }),
    });
    return product;
  }

  async listBackgroundPresets(): Promise<BackgroundPresetMeta[]> {
    const { presets } = await this.request<{ presets: BackgroundPresetMeta[] }>("/api/background-presets");
    return presets;
  }

  /** Product Studio's "upload your own background" — saved the same way as a product photo, then addressable via applyBackgroundPreset's customBackgroundUrl. Raw fetch, not this.request(): see addProductImage's comment on FormData. */
  async uploadCustomBackground(brandId: string, file: File): Promise<string> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.config.baseUrl}/api/brands/${brandId}/backgrounds`, { method: "POST", body: form, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    const { url } = (await res.json()) as { url: string };
    return url;
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

  /** `accessPassword` is write-only (set/change the shared password for `access: "password"`) — never present on a read, so never pass it back from a Campaign you just fetched. */
  async updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "tenantId" | "brandId" | "createdAt">> & { accessPassword?: string }): Promise<Campaign> {
    const { campaign } = await this.request<{ campaign: Campaign }>(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    return campaign;
  }

  /** Store design's brand logo — shown on the real storefront header. Raw fetch, not this.request(): see addProductImage's comment on FormData. */
  async uploadBrandLogo(brandId: string, file: File): Promise<Brand> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.config.baseUrl}/api/brands/${brandId}/logo`, { method: "POST", body: form, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    const { brand } = (await res.json()) as { brand: Brand };
    return brand;
  }

  /** Store tab's hero image — a real upload, replacing the old raw-URL text field. Raw fetch, not this.request(): see addProductImage's comment on FormData. */
  async uploadHeroImage(brandId: string, file: File): Promise<string> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.config.baseUrl}/api/brands/${brandId}/hero-image`, { method: "POST", body: form, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    const { url } = (await res.json()) as { url: string };
    return url;
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

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  async login(email: string, password: string): Promise<{ user: User; token: string; expiresAt: string }> {
    return this.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  /** A brand-new customer's own front door — creates their User, a fresh Tenant they own, their first Brand, and a group_owner membership tying them together, all in one call. Distinct from inviteTeamMember, which only ever adds someone to a tenant/brand that already exists. */
  async signup(input: {
    email: string;
    password: string;
    displayName: string;
    brand: { name: string; slug: string; country: string; currency: string; language: string; secondaryLanguage?: string | null };
  }): Promise<{ user: User; token: string; expiresAt: string; brand: Brand }> {
    return this.request("/api/auth/signup", { method: "POST", body: JSON.stringify(input) });
  }

  async logout(): Promise<void> {
    await this.request("/api/auth/logout", { method: "POST" });
  }

  async me(): Promise<{ user: User; memberships: BrandMembership[] }> {
    return this.request("/api/auth/me");
  }

  /** Only callable by a caller who is already brand_admin/group_owner on `brandId` — the server re-checks this, this isn't just a client-side gate. */
  async inviteTeamMember(input: { email: string; displayName: string; password: string; brandId: string; role: Role; tenantId: string }): Promise<{ user: User; membership: BrandMembership }> {
    return this.request("/api/auth/invite", { method: "POST", body: JSON.stringify(input) });
  }

  async listTeam(brandId: string): Promise<TeamMemberView[]> {
    const { team } = await this.request<{ team: TeamMemberView[] }>(`/api/brands/${brandId}/team`);
    return team;
  }

  /** 403s server-side unless the caller is brand_admin/group_owner. */
  async updateTeamMemberRole(brandId: string, userId: string, role: Role): Promise<BrandMembership> {
    const { membership } = await this.request<{ membership: BrandMembership }>(`/api/brands/${brandId}/team/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
    return membership;
  }

  /** Server blocks removing yourself (400) or the last group_owner (403) — surface those errors as-is. */
  async removeTeamMember(brandId: string, userId: string): Promise<void> {
    await this.request(`/api/brands/${brandId}/team/${userId}`, { method: "DELETE" });
  }

  /** Returns the freshly-generated plaintext password once — hand it to the teammate directly, nothing stores it. */
  async resetTeamMemberPassword(brandId: string, userId: string): Promise<string> {
    const { newPassword } = await this.request<{ newPassword: string }>(`/api/brands/${brandId}/team/${userId}/reset-password`, { method: "POST" });
    return newPassword;
  }

  async listAuditLog(brandId: string): Promise<AuditLogEntry[]> {
    const { entries } = await this.request<{ entries: AuditLogEntry[] }>(`/api/brands/${brandId}/audit-log`);
    return entries;
  }

  // ---------------------------------------------------------------------
  // Setup wizard steps + approval
  // ---------------------------------------------------------------------

  async listSetupSteps(brandId: string): Promise<SetupStepView[]> {
    const { steps } = await this.request<{ steps: SetupStepView[] }>(`/api/brands/${brandId}/setup-steps`);
    return steps;
  }

  async submitSetupStep(brandId: string, stepKey: SetupStepKey, note?: string): Promise<SetupStepView> {
    const { step } = await this.request<{ step: SetupStepView }>(`/api/brands/${brandId}/setup-steps/${stepKey}/submit`, { method: "POST", body: JSON.stringify({ note }) });
    return step;
  }

  /** 403s server-side if the caller's role on `brandId` isn't at least brand_admin. */
  async approveSetupStep(brandId: string, stepKey: SetupStepKey): Promise<SetupStepView> {
    const { step } = await this.request<{ step: SetupStepView }>(`/api/brands/${brandId}/setup-steps/${stepKey}/approve`, { method: "POST" });
    return step;
  }

  async rejectSetupStep(brandId: string, stepKey: SetupStepKey, note: string): Promise<SetupStepView> {
    const { step } = await this.request<{ step: SetupStepView }>(`/api/brands/${brandId}/setup-steps/${stepKey}/reject`, { method: "POST", body: JSON.stringify({ note }) });
    return step;
  }
}
