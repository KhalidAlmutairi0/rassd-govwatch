// prisma/migrate-sites.ts
// One-time migration: replace geo-blocked Saudi gov sites with globally accessible ones
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const URL_MIGRATION: Record<string, { url: string; name: string; nameAr: string; ministry: string; desc: string }> = {
  "https://www.absher.sa": {
    url: "https://www.vision2030.gov.sa",
    name: "Saudi Vision 2030",
    nameAr: "رؤية السعودية 2030",
    ministry: "مكتب رؤية 2030",
    desc: "الموقع الرسمي لرؤية المملكة 2030",
  },
  "https://www.my.gov.sa": {
    url: "https://www.spa.gov.sa",
    name: "Saudi Press Agency",
    nameAr: "وكالة الأنباء السعودية",
    ministry: "وكالة الأنباء السعودية",
    desc: "وكالة الأنباء الرسمية للمملكة",
  },
  "https://www.moh.gov.sa": {
    url: "https://www.ksu.edu.sa",
    name: "King Saud University",
    nameAr: "جامعة الملك سعود",
    ministry: "وزارة التعليم",
    desc: "جامعة الملك سعود - الرياض",
  },
  "https://qiwa.sa": {
    url: "https://www.aramco.com",
    name: "Saudi Aramco",
    nameAr: "أرامكو السعودية",
    ministry: "أرامكو السعودية",
    desc: "شركة أرامكو السعودية",
  },
  "https://www.hrdf.org.sa": {
    url: "https://www.neom.com",
    name: "NEOM",
    nameAr: "نيوم",
    ministry: "مشروع نيوم",
    desc: "مشروع نيوم - مدينة المستقبل",
  },
  "https://tawakkalna.sdaia.gov.sa": {
    url: "https://www.visitsaudi.com",
    name: "Saudi Tourism",
    nameAr: "هيئة السياحة السعودية",
    ministry: "هيئة السياحة",
    desc: "الهيئة السعودية للسياحة",
  },
  "https://rbu.edu.sa": {
    url: "https://www.kaust.edu.sa",
    name: "KAUST",
    nameAr: "كاوست",
    ministry: "جامعة الملك عبدالله للعلوم والتقنية",
    desc: "جامعة الملك عبدالله للعلوم والتقنية",
  },
  "https://balady.gov.sa": {
    url: "https://www.saudigazette.com.sa",
    name: "Saudi Gazette",
    nameAr: "سعودي جازيت",
    ministry: "صحيفة سعودي جازيت",
    desc: "صحيفة سعودي جازيت الإلكترونية",
  },
  "https://www.gosi.gov.sa": {
    url: "https://www.saudia.com",
    name: "Saudia Airlines",
    nameAr: "الخطوط السعودية",
    ministry: "الخطوط الجوية العربية السعودية",
    desc: "الخطوط الجوية العربية السعودية",
  },
  "https://www.najiz.sa": {
    url: "https://www.saudiexchange.sa",
    name: "Saudi Exchange",
    nameAr: "تداول السعودية",
    ministry: "تداول السعودية",
    desc: "السوق المالية السعودية - تداول",
  },
};

async function main() {
  console.log("🔄 Migrating sites to globally accessible URLs...\n");

  const sites = await prisma.site.findMany();

  for (const site of sites) {
    const migration = URL_MIGRATION[site.baseUrl];
    if (migration) {
      await prisma.site.update({
        where: { id: site.id },
        data: {
          name: migration.name,
          nameAr: migration.nameAr,
          ministryName: migration.ministry,
          baseUrl: migration.url,
          description: migration.desc,
          status: "unknown",
        },
      });
      console.log(`  ✅ ${site.name} → ${migration.name} (${migration.url})`);
    }
  }

  console.log("\n🎉 Migration complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
