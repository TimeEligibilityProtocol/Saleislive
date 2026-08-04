import { Brand, ImportBatch, Product } from "@saleis-live/domain";

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
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

  async createBrand(input: { tenantId: string; name: string; slug: string; country: string; currency: string }): Promise<Brand> {
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

  /** Stage a file — parses it and returns a row-by-row diff, but writes nothing yet. */
  async uploadImport(brandId: string, file: File): Promise<{ batch: ImportBatch }> {
    const token = await this.config.getAuthToken?.();
    const form = new FormData();
    form.append("brandId", brandId);
    form.append("file", file);
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
}
