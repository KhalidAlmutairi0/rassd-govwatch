// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRESET_SITES = [
  {
    name: "Absher",
    nameAr: "أبشر",
    baseUrl: "https://www.absher.sa",
    description: "Saudi electronic government services portal",
    schedule: 10,
  },
  {
    name: "Unified National Platform",
    nameAr: "المنصة الوطنية الموحدة",
    baseUrl: "https://www.my.gov.sa",
    description: "Saudi Arabia's unified national services platform",
    schedule: 10,
  },
  {
    name: "Ministry of Health",
    nameAr: "وزارة الصحة",
    baseUrl: "https://www.moh.gov.sa",
    description: "Saudi Ministry of Health official portal",
    schedule: 10,
  },
  {
    name: "Qiwa",
    nameAr: "قوى",
    baseUrl: "https://qiwa.sa",
    description: "Saudi labor market platform",
    schedule: 10,
  },
  {
    name: "Saudi Digital Academy",
    nameAr: "الأكاديمية الرقمية السعودية",
    baseUrl: "https://sda.edu.sa",
    description: "National digital skills training platform",
    schedule: 10,
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing preset sites to prevent duplicates on re-run
  const existingPresets = await prisma.site.findMany({ where: { isPreset: true } });
  if (existingPresets.length > 0) {
    console.log(`  🗑️  Removing ${existingPresets.length} existing preset site(s)...`);
    await prisma.site.deleteMany({ where: { isPreset: true } });
  }

  for (const siteData of PRESET_SITES) {
    // Create site
    const site = await prisma.site.create({
      data: {
        ...siteData,
        isPreset: true,
        isActive: true,
        status: "unknown",
      },
    });

    // Create default smoke test journey with deep element testing
    const defaultSteps = [
      { action: "navigate", description: "Open homepage", url: siteData.baseUrl, assertions: ["page_loaded", "title_exists"] },
      { action: "screenshot", description: "Capture initial state" },
      { action: "assert_element", description: "Verify page has main heading", selector: "h1, h2, [role='heading']" },
      { action: "discover_and_test_elements", description: "Discover and test all interactive elements" },
      { action: "screenshot", description: "Capture final state" },
    ];

    await prisma.journey.create({
      data: {
        siteId: site.id,
        name: `${siteData.name} Smoke Test`,
        type: "smoke",
        stepsJson: JSON.stringify(defaultSteps),
        isDefault: true,
      },
    });

    console.log(`  ✅ Seeded: ${siteData.name}`);
  }

  console.log("\n🎉 Seeding complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
