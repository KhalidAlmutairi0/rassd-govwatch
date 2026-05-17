// prisma/migrate-sites.ts
// One-time migration: restore original Saudi gov sites
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const URL_MIGRATION: Record<string, { url: string; name: string; nameAr: string; ministry: string; desc: string }> = {
  "https://www.vision2030.gov.sa": {
    url: "https://www.absher.sa",
    name: "Absher",
    nameAr: "أبشر",
    ministry: "وزارة الداخلية",
    desc: "بوابة الخدمات الحكومية الإلكترونية",
  },
  "https://www.spa.gov.sa": {
    url: "https://www.my.gov.sa",
    name: "Unified National Platform",
    nameAr: "المنصة الوطنية الموحدة",
    ministry: "هيئة الحكومة الرقمية",
    desc: "المنصة الوطنية الموحدة للخدمات الحكومية",
  },
  "https://www.ksu.edu.sa": {
    url: "https://www.moh.gov.sa",
    name: "Sehhaty",
    nameAr: "صحتي",
    ministry: "وزارة الصحة",
    desc: "منصة الخدمات الصحية الإلكترونية",
  },
  "https://www.aramco.com": {
    url: "https://qiwa.sa",
    name: "Qiwa",
    nameAr: "قوى",
    ministry: "وزارة الموارد البشرية والتنمية الاجتماعية",
    desc: "منصة سوق العمل السعودي",
  },
  "https://www.neom.com": {
    url: "https://www.hrdf.org.sa",
    name: "Hadaf",
    nameAr: "هدف",
    ministry: "صندوق تنمية الموارد البشرية",
    desc: "صندوق تنمية الموارد البشرية - هدف",
  },
  "https://www.visitsaudi.com": {
    url: "https://tawakkalna.sdaia.gov.sa",
    name: "Tawakkalna",
    nameAr: "توكلنا",
    ministry: "الهيئة السعودية للبيانات والذكاء الاصطناعي",
    desc: "تطبيق توكلنا للخدمات الرقمية",
  },
  "https://www.kaust.edu.sa": {
    url: "https://rbu.edu.sa",
    name: "Unified Admission",
    nameAr: "القبول الموحد",
    ministry: "وزارة التعليم",
    desc: "بوابة القبول الموحد للجامعات",
  },
  "https://www.saudigazette.com.sa": {
    url: "https://balady.gov.sa",
    name: "Balady",
    nameAr: "بلدي",
    ministry: "وزارة الشؤون البلدية والقروية والإسكان",
    desc: "منصة الخدمات البلدية الإلكترونية",
  },
  "https://www.saudia.com": {
    url: "https://www.gosi.gov.sa",
    name: "Taminaty",
    nameAr: "تأميناتي",
    ministry: "المؤسسة العامة للتأمينات الاجتماعية",
    desc: "منصة التأمينات الاجتماعية",
  },
  "https://www.saudiexchange.sa": {
    url: "https://www.najiz.sa",
    name: "Najiz",
    nameAr: "ناجز",
    ministry: "وزارة العدل",
    desc: "منصة الخدمات العدلية الإلكترونية",
  },
};

async function main() {
  console.log("🔄 Restoring original Saudi gov site URLs...\n");

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
