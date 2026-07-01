import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.providerCatalogEntry.upsert({
    where: { provider: "openai" },
    update: { enabled: true },
    create: { provider: "openai", enabled: true }
  });

  await prisma.exchangeRate.create({
    data: {
      base: "USD",
      quote: "EUR",
      rate: 0.92
    }
  });

  await prisma.adminSetting.upsert({
    where: { key: "GLOBAL_MAX_SLIDES" },
    update: { value: 50 },
    create: { key: "GLOBAL_MAX_SLIDES", value: 50 }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
