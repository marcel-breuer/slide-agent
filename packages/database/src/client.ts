import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const fallbackDatabaseUrl = "postgresql://slide_agent:slide_agent@localhost:5432/slide_agent";

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
  });
  return new PrismaClient({ adapter });
}
