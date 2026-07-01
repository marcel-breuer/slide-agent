import { PrismaClient } from "@prisma/client";

export * from "./presentations";

const globalForPrisma = globalThis as typeof globalThis & {
  slideAgentPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.slideAgentPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.slideAgentPrisma = prisma;
}
