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
    name: "Absher",
    nameAr: "أبشر",
    ministryName: "Ministry of Interior",
    baseUrl: "https://www.absher.sa",
    description: "Saudi electronic government services portal",
    schedule: 10,
  },
  {
    name: "Unified National Platform",
    nameAr: "المنصة الوطنية الموحدة",
    ministryName: "Ministry of Digital Economy & IT",
    baseUrl: "https://www.my.gov.sa",
    description: "Saudi Arabia's unified national services platform",
    schedule: 10,
  },
  {
    name: "Ministry of Health",
    nameAr: "وزارة الصحة",
    ministryName: "Ministry of Health",
    baseUrl: "https://www.moh.gov.sa",
    description: "Saudi Ministry of Health official portal",
    schedule: 10,
  },
  {
    name: "Qiwa",
    nameAr: "قوى",
    ministryName: "Ministry of Human Resources",
    baseUrl: "https://qiwa.sa",
    description: "Saudi labor market platform",
    schedule: 10,
  },
  {
    name: "Saudi Digital Academy",
    nameAr: "الأكاديمية الرقمية السعودية",
    ministryName: "Ministry of Communications",
    baseUrl: "https://sda.edu.sa",
    description: "National digital skills training platform",
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
    // siteBaseUrl → [ {weeksAgo, overall, qa, perf, access, ux} ]
    {
      url: "https://www.absher.sa",
      history: [
        { weeksAgo: 4, overall: 88, qa: 90, perf: 92, access: 82, ux: 89 },
        { weeksAgo: 3, overall: 86, qa: 88, perf: 90, access: 80, ux: 87 },
        { weeksAgo: 2, overall: 89, qa: 91, perf: 91, access: 85, ux: 90 },
        { weeksAgo: 1, overall: 91, qa: 93, perf: 93, access: 87, ux: 92 },
        { weeksAgo: 0, overall: 91, qa: 93, perf: 93, access: 87, ux: 92 },
      ],
    },
    {
      url: "https://www.my.gov.sa",
      history: [
        { weeksAgo: 4, overall: 80, qa: 82, perf: 85, access: 72, ux: 81 },
        { weeksAgo: 3, overall: 82, qa: 84, perf: 86, access: 74, ux: 83 },
        { weeksAgo: 2, overall: 79, qa: 80, perf: 83, access: 71, ux: 80 },
        { weeksAgo: 1, overall: 83, qa: 85, perf: 87, access: 76, ux: 84 },
        { weeksAgo: 0, overall: 85, qa: 87, perf: 88, access: 79, ux: 86 },
      ],
    },
    {
      url: "https://www.moh.gov.sa",
      history: [
        { weeksAgo: 4, overall: 74, qa: 75, perf: 78, access: 68, ux: 75 },
        { weeksAgo: 3, overall: 71, qa: 72, perf: 75, access: 65, ux: 72 },
        { weeksAgo: 2, overall: 68, qa: 69, perf: 72, access: 62, ux: 69 },
        { weeksAgo: 1, overall: 65, qa: 66, perf: 70, access: 58, ux: 66 },
        { weeksAgo: 0, overall: 63, qa: 64, perf: 68, access: 55, ux: 64 },
      ],
    },
    {
      url: "https://qiwa.sa",
      history: [
        { weeksAgo: 4, overall: 64, qa: 65, perf: 60, access: 60, ux: 65 },
        { weeksAgo: 3, overall: 58, qa: 59, perf: 55, access: 55, ux: 59 },
        { weeksAgo: 2, overall: 52, qa: 52, perf: 50, access: 50, ux: 53 },
        { weeksAgo: 1, overall: 48, qa: 48, perf: 45, access: 46, ux: 49 },
        { weeksAgo: 0, overall: 47, qa: 47, perf: 44, access: 44, ux: 48 },
      ],
    },
    {
      url: "https://sda.edu.sa",
      history: [
        { weeksAgo: 4, overall: 78, qa: 79, perf: 82, access: 72, ux: 79 },
        { weeksAgo: 3, overall: 80, qa: 81, perf: 84, access: 74, ux: 81 },
        { weeksAgo: 2, overall: 82, qa: 83, perf: 85, access: 77, ux: 83 },
        { weeksAgo: 1, overall: 84, qa: 85, perf: 87, access: 79, ux: 85 },
        { weeksAgo: 0, overall: 85, qa: 86, perf: 88, access: 80, ux: 86 },
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
