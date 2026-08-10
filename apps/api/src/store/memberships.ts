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

export interface TeamMemberView {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

/** Team screen's list — joins in the user's email/display name since a bare BrandMembership is just ids. */
export async function listTeamForBrand(brandId: string): Promise<TeamMemberView[]> {
  const rows = await prisma.brandMembership.findMany({ where: { brandId }, include: { user: true } });
  return rows.map((r) => ({ userId: r.userId, email: r.user.email, displayName: r.user.displayName, role: r.role }));
}

export async function updateMembershipRole(userId: string, brandId: string, role: Role): Promise<BrandMembership | undefined> {
  try {
    const row = await prisma.brandMembership.update({ where: { userId_brandId: { userId, brandId } }, data: { role } });
    return toDomain(row);
  } catch {
    return undefined;
  }
}

export async function removeMembership(userId: string, brandId: string): Promise<boolean> {
  try {
    await prisma.brandMembership.delete({ where: { userId_brandId: { userId, brandId } } });
    return true;
  } catch {
    return false;
  }
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
