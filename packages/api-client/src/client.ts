import { Brand, Product } from "@saleis-live/domain";

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
}
