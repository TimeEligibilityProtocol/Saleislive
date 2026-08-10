import { BrandMembership, Role } from "@saleis-live/domain";
import { prisma } from "../lib/prisma.js";
import { BrandMembership as PrismaBrandMembership } from "../generated/prisma/client.js";

function toDomain(row: PrismaBrandMembership): BrandMembership {
  return { userId: row.userId, brandId: row.brandId, tenantId: row.tenantId, role: row.role };
}

export async function getMembership(userId: string, brandId: string): Promise<BrandMembership | undefined> {
  const row = await prisma.brandMembership.findUnique({ where: { userId_brandId: { userId, brandId } } });
  return row ? toDomain(row) : undefined;
}

export async function listMembershipsForUser(userId: string): Promise<BrandMembership[]> {
  const rows = await prisma.brandMembership.findMany({ where: { userId } });
  return rows.map(toDomain);
}

export async function createMembership(input: BrandMembership): Promise<BrandMembership> {
  const row = await prisma.brandMembership.create({ data: input });
  return toDomain(row);
}

/** Role hierarchy for "senior enough to approve" checks — see blueprint §2's role list. Not a numeric field on Role itself, so approval gates don't accidentally depend on enum declaration order. */
const ROLE_RANK: Record<Role, number> = {
  read_only: 0,
  analyst: 1,
  order_manager: 2,
  merchandiser: 2,
  brand_admin: 3,
  group_owner: 4,
};

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
