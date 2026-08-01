import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";

const CHAPTERS_DIR = join(__dirname, "..", "data", "chapters");

async function main() {
  const files = readdirSync(CHAPTERS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const config = JSON.parse(readFileSync(join(CHAPTERS_DIR, file), "utf-8"));
    await prisma.chapter.upsert({
      where: { id: config.chapter_id },
      update: { config, version: config.version, active: true },
      create: {
        id: config.chapter_id,
        config,
        version: config.version,
        active: true,
      },
    });
    console.log(`Seeded chapter: ${config.chapter_id} (v${config.version})`);
  }

  const student = await prisma.student.findFirst({ where: { name: "Smaya" } });
  if (!student) {
    const created = await prisma.student.create({
      data: { name: "Smaya", currentLevel: 1 },
    });
    console.log(`Created student: ${created.name} (${created.id})`);
  } else {
    console.log(`Student already exists: ${student.name} (${student.id})`);
  }

  const starterPerks = [
    { name: "Pick tonight's dinner", pointCost: 50, icon: "🍽️" },
    { name: "30 min extra screen time", pointCost: 75, icon: "📱" },
    { name: "Stay up 30 min late", pointCost: 100, icon: "🌙" },
    { name: "Ice cream trip", pointCost: 250, icon: "🍦" },
  ];
  for (const perk of starterPerks) {
    const existing = await prisma.perk.findFirst({ where: { name: perk.name } });
    if (!existing) {
      await prisma.perk.create({ data: perk });
      console.log(`Seeded perk: ${perk.name}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
