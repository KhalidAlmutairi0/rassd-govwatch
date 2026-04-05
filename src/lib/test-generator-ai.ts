// src/lib/test-generator-ai.ts
import { callAI } from "./ai";
import { TestStep, TestStepsArraySchema } from "./validators";
import { PageMetadata } from "./page-analyzer";
import { generateSmokeTest } from "./test-generator";

export async function generateSmokeTestWithAI(
  baseUrl: string,
  metadata: PageMetadata
): Promise<TestStep[]> {
  const prompt = `You are a QA engineer generating safe smoke test steps for a Saudi government website.

SITE: ${baseUrl}
TITLE: ${metadata.title}
LANGUAGE: ${metadata.language}
MAIN HEADING: ${metadata.mainHeading}
NAVIGATION LINKS (first 10): ${JSON.stringify(metadata.navigationLinks.slice(0, 10))}
SEARCH INPUTS: ${JSON.stringify(metadata.searchInputs)}
FORMS: ${JSON.stringify(metadata.forms.slice(0, 3))}
HAS LOGIN: ${metadata.hasLogin}
HAS CAPTCHA: ${metadata.hasCaptcha}

RULES:
- Generate 5-12 test steps as a JSON array
- ONLY same-domain URLs
- NEVER submit forms
- NEVER interact with login/auth/CAPTCHA
- NEVER click destructive buttons (delete, remove, etc.)
- Use Arabic search terms for Arabic sites
- Each step needs: action, description, and optionally url/selector/value/assertions

ALLOWED ACTIONS: navigate, click, type, assert_title, assert_element, screenshot, wait, detect_search, detect_forms, discover_links

Return ONLY a JSON array of steps. No markdown, no explanation.`;

  const response = await callAI(prompt);

  try {
    // Try to extract JSON from response (in case AI adds markdown)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    const steps = JSON.parse(jsonStr);
    return TestStepsArraySchema.parse(steps);
  } catch (error) {
    // Fallback to heuristic if AI output is invalid
    console.warn("AI generated invalid steps, falling back to heuristic");
    return generateSmokeTest(baseUrl, metadata);
  }
}
