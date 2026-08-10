import { ImportBatch, ImportRowDiff, IntakeMethod, MatchMethod, PhotoTreatment } from "@saleis-live/domain";
import { prisma } from "../lib/prisma.js";
import { ImportBatch as PrismaImportBatch, Prisma } from "../generated/prisma/client.js";

const toJson = (v: unknown) => v as Prisma.InputJsonValue;

/** Persisted in Postgres via Prisma — see prisma/schema.prisma's ImportBatch model comment. */

function toDomainBatch(row: PrismaImportBatch): ImportBatch {
  return {
    id: row.id,
    tenantId: row.tenantId,
    brandId: row.brandId,
    fileName: row.fileName,
    status: row.status,
    rows: row.rows as unknown as ImportRowDiff[],
    createdAt: row.createdAt.toISOString(),
    committedAt: row.committedAt ? row.committedAt.toISOString() : null,
    rollbackOfBatchId: row.rollbackOfBatchId,
    intakeMethod: row.intakeMethod as IntakeMethod,
    photoTreatment: row.photoTreatment as unknown as PhotoTreatment[],
    matchMethod: row.matchMethod as MatchMethod,
  };
}

export async function createBatch(input: Omit<ImportBatch, "id" | "status" | "createdAt" | "committedAt" | "rollbackOfBatchId">): Promise<ImportBatch> {
  const row = await prisma.importBatch.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId,
      fileName: input.fileName,
      rows: toJson(input.rows),
      intakeMethod: input.intakeMethod,
      photoTreatment: toJson(input.photoTreatment),
      matchMethod: input.matchMethod,
    },
  });
  return toDomainBatch(row);
}

export async function getBatch(id: string): Promise<ImportBatch | undefined> {
  const row = await prisma.importBatch.findUnique({ where: { id } });
  return row ? toDomainBatch(row) : undefined;
}

export async function markCommitted(id: string): Promise<ImportBatch | undefined> {
  try {
    const row = await prisma.importBatch.update({ where: { id }, data: { status: "committed", committedAt: new Date() } });
    return toDomainBatch(row);
  } catch {
    return undefined;
  }
}

export async function listBatchesForBrand(brandId: string): Promise<ImportBatch[]> {
  const rows = await prisma.importBatch.findMany({ where: { brandId } });
  return rows.map(toDomainBatch);
}
