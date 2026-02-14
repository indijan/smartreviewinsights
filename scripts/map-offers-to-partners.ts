import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

async function main() {
  const partners = await prisma.partner.findMany({ select: { id: true, source: true, name: true } });

  let updated = 0;
  for (const partner of partners) {
    const res = await prisma.offer.updateMany({
      where: {
        source: partner.source,
        partnerId: null,
      },
      data: {
        partnerId: partner.id,
      },
    });

    updated += res.count;
    console.log(`Mapped ${res.count} offers -> ${partner.name}`);
  }

  console.log(`Total mapped: ${updated}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
