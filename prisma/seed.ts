// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, pbkdf2Sync } from "crypto";

const prisma = new PrismaClient();

// ── Password hashing (must match src/lib/auth.ts) ────────────────────────────
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 10_000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

// ── Preset sites ──────────────────────────────────────────────────────────────
const PRESET_SITES = [
  {
    name: "Saudi Vision 2030",
    nameAr: "رؤية السعودية 2030",
    ministryName: "مكتب رؤية 2030",
    baseUrl: "https://www.vision2030.gov.sa",
    description: "الموقع الرسمي لرؤية المملكة 2030",
    schedule: 10,
  },
  {
    name: "Saudi Press Agency",
    nameAr: "وكالة الأنباء السعودية",
    ministryName: "وكالة الأنباء السعودية",
    baseUrl: "https://www.spa.gov.sa",
    description: "وكالة الأنباء الرسمية للمملكة",
    schedule: 10,
  },
  {
    name: "King Saud University",
    nameAr: "جامعة الملك سعود",
    ministryName: "وزارة التعليم",
    baseUrl: "https://www.ksu.edu.sa",
    description: "جامعة الملك سعود - الرياض",
    schedule: 10,
  },
  {
    name: "Saudi Aramco",
    nameAr: "أرامكو السعودية",
    ministryName: "أرامكو السعودية",
    baseUrl: "https://www.aramco.com",
    description: "شركة أرامكو السعودية",
    schedule: 10,
  },
  {
    name: "NEOM",
    nameAr: "نيوم",
    ministryName: "مشروع نيوم",
    baseUrl: "https://www.neom.com",
    description: "مشروع نيوم - مدينة المستقبل",
    schedule: 10,
  },
  {
    name: "Saudi Tourism",
    nameAr: "هيئة السياحة السعودية",
    ministryName: "هيئة السياحة",
    baseUrl: "https://www.visitsaudi.com",
    description: "الهيئة السعودية للسياحة",
    schedule: 10,
  },
  {
    name: "KAUST",
    nameAr: "كاوست",
    ministryName: "جامعة الملك عبدالله للعلوم والتقنية",
    baseUrl: "https://www.kaust.edu.sa",
    description: "جامعة الملك عبدالله للعلوم والتقنية",
    schedule: 10,
  },
  {
    name: "Saudi Gazette",
    nameAr: "سعودي جازيت",
    ministryName: "صحيفة سعودي جازيت",
    baseUrl: "https://www.saudigazette.com.sa",
    description: "صحيفة سعودي جازيت الإلكترونية",
    schedule: 10,
  },
  {
    name: "Saudia Airlines",
    nameAr: "الخطوط السعودية",
    ministryName: "الخطوط الجوية العربية السعودية",
    baseUrl: "https://www.saudia.com",
    description: "الخطوط الجوية العربية السعودية",
    schedule: 10,
  },
  {
    name: "Saudi Exchange",
    nameAr: "تداول السعودية",
    ministryName: "تداول السعودية",
    baseUrl: "https://www.saudiexchange.sa",
    description: "السوق المالية السعودية - تداول",
    schedule: 10,
  },
];

// ── Test users ────────────────────────────────────────────────────────────────
const TEST_USERS = [
  {
    email: "khalid@rassd.sa",
    name: "Khalid",
    role: "governor" as const,
    password: "Khalid@2025",
    notifyEmail: true,
    notifySlack: false,
  },
  {
    email: "zyad@rassd.sa",
    name: "Zyad",
    role: "developer" as const,
    password: "Zyad@2025",
    notifyEmail: true,
    notifySlack: false,
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  // ── Seed users ──────────────────────────────────────────────────────────────
  console.log("\n👤 Creating test users...");
  for (const userData of TEST_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: userData.email } });
    if (existing) {
      console.log(`  ⏭️  User already exists: ${userData.email}`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        passwordHash: hashPassword(userData.password),
        notifyEmail: userData.notifyEmail,
        notifySlack: userData.notifySlack,
        failedAttempts: 0,
      },
    });
    console.log(`  ✅ Created ${userData.role}: ${userData.email} / ${userData.password}`);
  }

  // ── Seed sites ──────────────────────────────────────────────────────────────
  console.log("\n🌐 Creating monitored sites...");
  for (const siteData of PRESET_SITES) {
    const existing = await prisma.site.findFirst({ where: { baseUrl: siteData.baseUrl } });
    if (existing) {
      // Update ministryName if missing
      if (!existing.ministryName) {
        await prisma.site.update({
          where: { id: existing.id },
          data: { ministryName: siteData.ministryName },
        });
        console.log(`  🔄 Updated ministryName for: ${siteData.name}`);
      } else {
        console.log(`  ⏭️  Site already exists: ${siteData.name}`);
      }
      continue;
    }

    const site = await prisma.site.create({
      data: {
        name: siteData.name,
        nameAr: siteData.nameAr,
        ministryName: siteData.ministryName,
        baseUrl: siteData.baseUrl,
        description: siteData.description,
        schedule: siteData.schedule,
        isPreset: true,
        isActive: true,
        status: "unknown",
      },
    });

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

    console.log(`  ✅ Seeded: ${siteData.name} (${siteData.ministryName})`);
  }

  // ── Seed initial SiteScore snapshots (for portfolio health demo) ────────────
  console.log("\n📊 Creating initial score snapshots...");
  const seedScores = [
    {
      url: "https://www.vision2030.gov.sa",
      history: [
        { weeksAgo: 4, overall: 88, qa: 90, perf: 92, access: 82, ux: 89 },
        { weeksAgo: 3, overall: 86, qa: 88, perf: 90, access: 80, ux: 87 },
        { weeksAgo: 2, overall: 89, qa: 91, perf: 91, access: 85, ux: 90 },
        { weeksAgo: 1, overall: 91, qa: 93, perf: 93, access: 87, ux: 92 },
        { weeksAgo: 0, overall: 91, qa: 93, perf: 93, access: 87, ux: 92 },
      ],
    },
    {
      url: "https://www.spa.gov.sa",
      history: [
        { weeksAgo: 4, overall: 80, qa: 82, perf: 85, access: 72, ux: 81 },
        { weeksAgo: 3, overall: 82, qa: 84, perf: 86, access: 74, ux: 83 },
        { weeksAgo: 2, overall: 79, qa: 80, perf: 83, access: 71, ux: 80 },
        { weeksAgo: 1, overall: 83, qa: 85, perf: 87, access: 76, ux: 84 },
        { weeksAgo: 0, overall: 85, qa: 87, perf: 88, access: 79, ux: 86 },
      ],
    },
    {
      url: "https://www.ksu.edu.sa",
      history: [
        { weeksAgo: 4, overall: 74, qa: 75, perf: 78, access: 68, ux: 75 },
        { weeksAgo: 3, overall: 76, qa: 77, perf: 80, access: 70, ux: 77 },
        { weeksAgo: 2, overall: 78, qa: 79, perf: 82, access: 72, ux: 79 },
        { weeksAgo: 1, overall: 80, qa: 81, perf: 84, access: 74, ux: 81 },
        { weeksAgo: 0, overall: 82, qa: 83, perf: 85, access: 76, ux: 83 },
      ],
    },
    {
      url: "https://www.aramco.com",
      history: [
        { weeksAgo: 4, overall: 64, qa: 65, perf: 60, access: 60, ux: 65 },
        { weeksAgo: 3, overall: 66, qa: 67, perf: 62, access: 62, ux: 67 },
        { weeksAgo: 2, overall: 68, qa: 69, perf: 65, access: 64, ux: 69 },
        { weeksAgo: 1, overall: 70, qa: 71, perf: 67, access: 66, ux: 71 },
        { weeksAgo: 0, overall: 72, qa: 73, perf: 69, access: 68, ux: 73 },
      ],
    },
    {
      url: "https://www.neom.com",
      history: [
        { weeksAgo: 4, overall: 78, qa: 79, perf: 82, access: 72, ux: 79 },
        { weeksAgo: 3, overall: 80, qa: 81, perf: 84, access: 74, ux: 81 },
        { weeksAgo: 2, overall: 82, qa: 83, perf: 85, access: 77, ux: 83 },
        { weeksAgo: 1, overall: 84, qa: 85, perf: 87, access: 79, ux: 85 },
        { weeksAgo: 0, overall: 85, qa: 86, perf: 88, access: 80, ux: 86 },
      ],
    },
    {
      url: "https://www.visitsaudi.com",
      history: [
        { weeksAgo: 4, overall: 90, qa: 92, perf: 94, access: 84, ux: 91 },
        { weeksAgo: 3, overall: 91, qa: 93, perf: 94, access: 86, ux: 92 },
        { weeksAgo: 2, overall: 92, qa: 93, perf: 95, access: 87, ux: 93 },
        { weeksAgo: 1, overall: 93, qa: 94, perf: 95, access: 88, ux: 94 },
        { weeksAgo: 0, overall: 94, qa: 95, perf: 96, access: 90, ux: 94 },
      ],
    },
    {
      url: "https://www.kaust.edu.sa",
      history: [
        { weeksAgo: 4, overall: 70, qa: 72, perf: 74, access: 64, ux: 71 },
        { weeksAgo: 3, overall: 72, qa: 74, perf: 76, access: 66, ux: 73 },
        { weeksAgo: 2, overall: 74, qa: 76, perf: 78, access: 68, ux: 75 },
        { weeksAgo: 1, overall: 76, qa: 78, perf: 80, access: 70, ux: 77 },
        { weeksAgo: 0, overall: 77, qa: 79, perf: 81, access: 71, ux: 78 },
      ],
    },
    {
      url: "https://www.saudigazette.com.sa",
      history: [
        { weeksAgo: 4, overall: 75, qa: 77, perf: 80, access: 69, ux: 76 },
        { weeksAgo: 3, overall: 76, qa: 78, perf: 81, access: 70, ux: 77 },
        { weeksAgo: 2, overall: 78, qa: 80, perf: 83, access: 72, ux: 79 },
        { weeksAgo: 1, overall: 80, qa: 82, perf: 84, access: 74, ux: 81 },
        { weeksAgo: 0, overall: 81, qa: 83, perf: 85, access: 75, ux: 82 },
      ],
    },
    {
      url: "https://www.saudia.com",
      history: [
        { weeksAgo: 4, overall: 82, qa: 84, perf: 86, access: 76, ux: 83 },
        { weeksAgo: 3, overall: 83, qa: 85, perf: 87, access: 77, ux: 84 },
        { weeksAgo: 2, overall: 84, qa: 86, perf: 88, access: 78, ux: 85 },
        { weeksAgo: 1, overall: 86, qa: 88, perf: 89, access: 80, ux: 87 },
        { weeksAgo: 0, overall: 87, qa: 89, perf: 90, access: 82, ux: 88 },
      ],
    },
    {
      url: "https://www.saudiexchange.sa",
      history: [
        { weeksAgo: 4, overall: 86, qa: 88, perf: 90, access: 80, ux: 87 },
        { weeksAgo: 3, overall: 87, qa: 89, perf: 91, access: 81, ux: 88 },
        { weeksAgo: 2, overall: 88, qa: 90, perf: 92, access: 82, ux: 89 },
        { weeksAgo: 1, overall: 89, qa: 91, perf: 93, access: 83, ux: 90 },
        { weeksAgo: 0, overall: 90, qa: 92, perf: 93, access: 85, ux: 91 },
      ],
    },
  ];

  function gradeFrom(score: number): string {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  for (const entry of seedScores) {
    const site = await prisma.site.findFirst({ where: { baseUrl: entry.url } });
    if (!site) continue;

    // Skip if scores already exist
    const existing = await (prisma as any).siteScore.count({ where: { siteId: site.id } });
    if (existing > 0) {
      console.log(`  ⏭️  Scores already exist for: ${site.name}`);
      continue;
    }

    for (const snap of entry.history) {
      await (prisma as any).siteScore.create({
        data: {
          siteId: site.id,
          computedAt: new Date(Date.now() - snap.weeksAgo * WEEK_MS),
          overallScore: snap.overall,
          grade: gradeFrom(snap.overall),
          qaScore: snap.qa,
          perfScore: snap.perf,
          accessScore: snap.access,
          uxScore: snap.ux,
        },
      });
    }
    console.log(`  ✅ Scores seeded for: ${site.name}`);
  }

  console.log("\n🎉 Seeding complete!");
  console.log("\n📋 Login credentials:");
  console.log("   Governor: Khalid@rassd.sa / Khalid@2025  →  /gov");
  console.log("   Developer: Zyad@rassd.sa / Zyad@2025  →  /dashboard");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
