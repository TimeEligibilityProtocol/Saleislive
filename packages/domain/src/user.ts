/** A platform-level account — never carries password material. Tenant/brand access lives in BrandMembership (see tenant.ts), not here, since one person can belong to multiple brands with different roles. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}
