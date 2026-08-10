import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// Prisma 7 requires an explicit driver adapter instead of a bare
// connection-string option — see https://pris.ly/d/driver-adapters.
// Render's managed Postgres requires SSL; rejectUnauthorized: false because
// Render's cert chain isn't one Node trusts by default (same as Render's
// own documented psql/pg connection examples), not a security downgrade
// we're choosing casually.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
export const prisma = new PrismaClient({ adapter });
