// src/lib/test-generator-ai.ts
import { callAI } from "./ai";
import { TestStep, TestStepsArraySchema } from "./validators";
import { PageMetadata } from "./page-analyzer";
import { generateSmokeTest } from "./test-generator";

// ── Known Saudi government site journeys ─────────────────────────────────────
// Provides the AI with real citizen context so it generates meaningful journeys.
const SITE_CONTEXT: Record<string, string> = {
  "absher.sa": "Absher is the Saudi Ministry of Interior e-services portal. Citizens use it to: renew iqama (residency), pay traffic violations, update personal information, access visa services, view driver's license status. Key sections: Personal services, Business services, Enquiries.",
  "my.gov.sa": "Unified National Platform aggregating all government services. Citizens use it to: find services by life event (birth, marriage, employment), access ministry links, view national announcements, and search any government service.",
  "moh.gov.sa": "Saudi Ministry of Health. Citizens use it to: find hospitals and clinics, book appointments, access health statistics, view vaccination schedules, read health awareness content, find emergency contacts. Key sections: Health services, Hospitals finder, Statistics.",
  "qiwa.sa": "Saudi labor market platform by the Ministry of Human Resources. Citizens use it to: verify employment status, issue work permits, check Saudization compliance, access Wage Protection System data, and apply for labor services.",
  "sda.edu.sa": "Saudi Digital Academy — national digital skills training. Citizens use it to: browse training programs, register for courses, view learning paths, find bootcamps and scholarships, access digital transformation content.",
  "hrsd.gov.sa": "Ministry of Human Resources and Social Development. Citizens access labor services, social support programs, Saudization regulations, and workforce development resources.",
  "moe.gov.sa": "Ministry of Education. Citizens access educational policies, school lookup, university admission, scholarship programs, and academic statistics.",
  "mcit.gov.sa": "Ministry of Communications and Information Technology. Citizens access digital transformation initiatives, telecom licensing, and ICT sector news.",
};

function getSiteContext(baseUrl: string): string {
  try {
    const hostname = new URL(baseUrl).hostname.replace("www.", "");
    for (const [key, ctx] of Object.entries(SITE_CONTEXT)) {
      if (hostname.includes(key)) return ctx;
    }
  } catch {}
  return "";
}

export async function generateSmokeTestWithAI(
  baseUrl: string,
  metadata: PageMetadata
): Promise<TestStep[]> {
  const siteContext = getSiteContext(baseUrl);
  const isArabic = metadata.language === "ar" || /[\u0600-\u06FF]/.test(metadata.title);

  const prompt = `You are a senior QA engineer testing a Saudi government website on behalf of real citizens. Generate a precise, meaningful smoke test that validates critical citizen-facing functionality — not generic page checks.

SITE: ${baseUrl}
TITLE: ${metadata.title}
LANGUAGE: ${isArabic ? "Arabic (RTL site)" : "English"}
MAIN HEADING: ${metadata.mainHeading}
${siteContext ? `SITE PURPOSE: ${siteContext}` : ""}
NAVIGATION LINKS: ${JSON.stringify(metadata.navigationLinks.slice(0, 12))}
SEARCH INPUTS DETECTED: ${JSON.stringify(metadata.searchInputs)}
FORMS DETECTED: ${JSON.stringify(metadata.forms.slice(0, 3))}
HAS LOGIN/AUTH WALL: ${metadata.hasLogin}
HAS CAPTCHA: ${metadata.hasCaptcha}
INTERNAL LINKS SAMPLE: ${JSON.stringify(metadata.internalLinks.slice(0, 8))}

TASK: Generate 8–14 test steps simulating what a real citizen does on this site.

REQUIRED COVERAGE:
1. Homepage loads — correct title and main heading are visible
2. Primary navigation: test 2-4 important section links (pick meaningful ones from nav, not generic "home")
3. After each navigation: add an assert_element to verify that specific page's content loaded (use h1, h2, or a meaningful selector)
4. If search exists: type a realistic query — use Arabic terms for Arabic sites (e.g. "خدمات", "مستشفيات", "تعليم", "رخصة قيادة")
5. Verify at least one key service section is reachable based on the site's purpose
6. Check important utility content is present (contact/about section if nav shows it)

ABSOLUTE SAFETY RULES — violating these is not allowed:
- ONLY navigate to same-domain URLs (same hostname as ${baseUrl})
- NEVER submit any form — detect presence only
- NEVER click submit/login/register/nafath/OTP/captcha elements
- NEVER navigate to paths containing: login, logout, signin, register, auth, oauth, nafath, admin, delete, payment
- For search: type the query ONLY — do not click submit or press enter to submit
- NEVER click destructive buttons

QUALITY STANDARDS:
- Step descriptions must be specific: "Verify 'Hospitals Finder' link is visible" not "Check heading"
- assert_element selectors should target real content: "h1", ".service-card", "[data-testid='search-results']", "nav", "footer" etc.
- At least 3 assert_element steps checking meaningful content (not just generic elements)
- Prioritise steps that would reveal real outages affecting citizens

OUTPUT: Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
Schema per item: { "action": string, "description": string, "url"?: string, "selector"?: string, "value"?: string, "assertions"?: string[] }
Allowed actions: navigate, click, type, assert_title, assert_element, screenshot, wait, detect_search, detect_forms`;

  const response = await callAI(prompt);

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    const steps = JSON.parse(jsonStr);
    return TestStepsArraySchema.parse(steps);
  } catch (error) {
    console.warn("AI generated invalid steps, falling back to heuristic");
    return generateSmokeTest(baseUrl, metadata);
  }
}
