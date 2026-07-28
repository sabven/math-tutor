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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
