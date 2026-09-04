import { prisma } from "@/lib/db";

const CREATORS = [
  { name: "Jason Pizzino", slug: "jason-pizzino", analysisProfile: "jason_pizzino" },
  { name: "Michael Pizzino", slug: "michael-pizzino", analysisProfile: "michael_pizzino" },
];

async function main() {
  for (const creator of CREATORS) {
    await prisma.creator.upsert({
      where: { slug: creator.slug },
      create: creator,
      update: { name: creator.name, analysisProfile: creator.analysisProfile },
    });
    console.log(`Seeded creator: ${creator.slug}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
