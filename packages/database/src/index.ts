import type { PrismaClient } from "@prisma/client";

import { createPrismaClient } from "./client";
export * from "./presentations";

const globalForPrisma = globalThis as typeof globalThis & {
  slideAgentPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.slideAgentPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.slideAgentPrisma = prisma;
}
