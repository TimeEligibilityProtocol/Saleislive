import { prisma } from "../lib/prisma.js";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
}

/**
 * Fire-and-forget by design — an audit-log write failing should never
 * block or fail the real action it's recording (a refund succeeding
 * matters more than the log entry about the refund). Errors are
 * swallowed with a console.error rather than thrown.
 */
export async function logAudit(input: { tenantId: string; brandId: string; userId: string | null; action: string; entityType: string; entityId: string; metadata?: unknown }): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        brandId: input.brandId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata === undefined ? undefined : (input.metadata as object),
      },
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}

export async function listAuditLog(brandId: string, limit = 200): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLog.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
  }));
}
