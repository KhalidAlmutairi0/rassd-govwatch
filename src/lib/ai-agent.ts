// src/lib/ai-agent.ts
// THE AI AGENT — The brain that understands pages and decides what to test

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ============================================================
// Type Definitions
// ============================================================

export interface AgentTestPlan {
  pageUnderstanding: {
    siteName: string;
    siteNameAr?: string;
    pageType: string;           // "homepage", "services", "about", "contact"
    language: string;           // "ar", "en", "mixed"
    description: string;        // AI's understanding of the page
    descriptionAr: string;      // Arabic description
  };
  elements: AgentTestAction[];
}

export interface AgentTestAction {
  id: number;
  element: string;              // Human-readable: "Navigation link 'البرامج'"
  selector: string;             // CSS selector to find it
  type: string;                 // "nav-link", "button", "dropdown", "tab", "form", "search", "cta"
  action: string;               // "click", "hover", "type", "select"
  reason: string;               // WHY the AI wants to test this
  priority: "high" | "medium" | "low";
  expectedBehavior: string;     // What SHOULD happen
  isSafe: boolean;              // AI's safety assessment
  section: string;              // "header", "nav", "hero", "content", "sidebar", "footer"
}

export interface AgentStepResult {
  testAction: AgentTestAction;
  status: "passed" | "failed" | "warning" | "skipped";
  actualBehavior: string;       // AI's description of what happened
  responseTimeMs: number;
  screenshotBefore: string;
  screenshotAfter: string;
  urlChanged: boolean;
  urlBefore: string;
  urlAfter: string;
  consoleErrors: string[];
  networkErrors: string[];
  aiAssessment: string;         // AI's verdict on this specific element
}

// ============================================================
// PHASE 2: AI Analyzes the Page & Creates Test Plan
// ============================================================

export async function analyzePageAndCreatePlan(
  screenshot: Buffer,           // Full-page screenshot as image
  htmlStructure: string,        // Simplified HTML structure (interactive elements only)
  url: string,
  metadata: { title: string; description?: string; lang?: string },
  accessibilityTree?: string    // Semantic accessibility tree (structured page representation)
): Promise<AgentTestPlan> {

  const prompt = `You are an expert QA tester for Saudi government websites.

I'm showing you a screenshot of a government website, its HTML structure, and its accessibility tree.

**URL:** ${url}
**Page Title:** ${metadata.title}
**Meta Description:** ${metadata.description || "N/A"}
**Language:** ${metadata.lang || "unknown"}

**HTML Interactive Elements:**
\`\`\`html
${htmlStructure.slice(0, 3000)}${htmlStructure.length > 3000 ? '\n... (truncated)' : ''}
\`\`\`

**Accessibility Tree (Semantic Page Structure):**
\`\`\`
${accessibilityTree ? accessibilityTree.slice(0, 2000) : 'Not available'}${accessibilityTree && accessibilityTree.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`

The accessibility tree provides a structured, semantic representation of the page. Use it alongside the HTML to better understand:
- The hierarchical structure of the page
- Semantic roles of elements (button, link, navigation, heading, etc.)
- Accessible names and labels
- The relationship between interactive elements

## YOUR TASK:

### 1. Understand the Page
Look at the screenshot carefully. What is this website? What is its purpose? Describe what you see — in English and Arabic.

### 2. Create a Test Plan
Identify EVERY interactive element you can see and create a test plan. For each element:
- Give it a human-readable name
- Provide the best CSS selector to find it
- Classify its type (nav-link, button, dropdown, tab, form-input, search, cta, toggle, accordion, carousel, modal-trigger, menu-item)
- Decide what action to perform (click, hover, type, select)
- Explain WHY you want to test it
- Set priority (high/medium/low)
- Describe what SHOULD happen when interacted with
- Assess if it's SAFE to interact with

### SAFETY RULES — Mark as isSafe: false for:
- Login/logout/authentication buttons (تسجيل دخول، خروج، login, sign in)
- Payment/purchase buttons (دفع، شراء، pay, purchase)
- Delete/remove buttons (حذف، إزالة، delete, remove)
- Form submission that creates real records (إرسال، تقديم، submit)
- Download buttons (تحميل، download)
- Nafath/national SSO (نفاذ)
- Any button that could modify data or state permanently

### PRIORITIZATION:
- HIGH: Navigation links, main CTAs, search, language switcher, accessibility features
- MEDIUM: Secondary buttons, tabs, dropdowns, accordions
- LOW: Footer links, social media icons, decorative elements

## RESPOND IN THIS EXACT JSON FORMAT:

\`\`\`json
{
  "pageUnderstanding": {
    "siteName": "...",
    "siteNameAr": "...",
    "pageType": "...",
    "language": "...",
    "description": "English description of what you see",
    "descriptionAr": "وصف عربي لما تراه"
  },
  "elements": [
    {
      "id": 1,
      "element": "Human readable name",
      "selector": "CSS selector",
      "type": "nav-link",
      "action": "click",
      "reason": "Why test this",
      "priority": "high",
      "expectedBehavior": "Should navigate to programs page",
      "isSafe": true,
      "section": "header"
    }
  ]
}
\`\`\`

IMPORTANT:
- Order elements by priority (high first)
- Maximum 80 elements (focus on what matters)
- Be specific with CSS selectors — use unique attributes, text content, or nth-child
- If you can't determine a reliable selector from the HTML, use the best approximation
- Include elements from ALL sections: header, nav, hero, content, sidebar, footer`;

  // Call AI with vision (screenshot + text) — catch both API errors and parse errors
  try {
    const plan = await callAIWithVision(prompt, screenshot);
    const parsed = JSON.parse(plan);

    if (!parsed.pageUnderstanding) {
      parsed.pageUnderstanding = {
        siteName: metadata.title,
        siteNameAr: "",
        pageType: "unknown",
        language: metadata.lang || "en",
        description: "Unable to analyze page",
        descriptionAr: "غير قادر على تحليل الصفحة"
      };
    }

    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      parsed.elements = [];
    }

    return parsed as AgentTestPlan;
  } catch (error: any) {
    const reason = error?.status === 429 ? "rate limit reached" :
                   error?.code === "rate_limit_exceeded" ? "rate limit reached" :
                   "AI call failed";
    console.warn(`[AI] analyzePageAndCreatePlan: ${reason} — using heuristic fallback`);
    return fallbackAnalysis(url, metadata, htmlStructure);
  }
}

// ============================================================
// PHASE 3 (per element): AI Assesses the Result
// ============================================================

export async function assessElementResult(
  testAction: AgentTestAction,
  screenshotBefore: Buffer,
  screenshotAfter: Buffer,
  context: {
    urlChanged: boolean;
    urlBefore: string;
    urlAfter: string;
    consoleErrors: string[];
    networkErrors: string[];
    responseTimeMs: number;
    pageTitle: string;
  }
): Promise<{ status: string; assessment: string }> {

  const prompt = `You are a QA tester. You just tested an element on a Saudi government website.

**Element:** ${testAction.element}
**Type:** ${testAction.type}
**Action Performed:** ${testAction.action}
**Expected Behavior:** ${testAction.expectedBehavior}

**What Happened:**
- URL changed: ${context.urlChanged} (${context.urlBefore} → ${context.urlAfter})
- Response time: ${context.responseTimeMs}ms
- Console errors: ${context.consoleErrors.length > 0 ? context.consoleErrors.join(", ") : "None"}
- Network errors: ${context.networkErrors.length > 0 ? context.networkErrors.join(", ") : "None"}
- Page title after: ${context.pageTitle}

I'm showing you two screenshots: BEFORE the action and AFTER the action.

## ASSESS:
1. Did the element respond correctly?
2. Was the behavior as expected?
3. Are there any visual issues (broken layout, error messages, blank page)?
4. Rate: "passed", "failed", or "warning"

Response time guidelines:
- Under 1s = good
- 1-3s = acceptable but slow (warning if >2s)
- Over 3s = too slow (warning)
- Timeout (>5s) = failed

Respond in JSON:
\`\`\`json
{
  "status": "passed|failed|warning",
  "assessment": "Brief description of what happened and your verdict"
}
\`\`\``;

  try {
    const result = await callAIWithVision(prompt, screenshotBefore, screenshotAfter);
    const parsed = JSON.parse(result);

    if (!parsed.status || !parsed.assessment) {
      return fallbackAssessment(testAction, context);
    }

    return parsed;
  } catch (error) {
    console.error("Failed to assess element result, using fallback:", error);
    return fallbackAssessment(testAction, context);
  }
}

// ============================================================
// PHASE 4: AI Generates Final Summary
// ============================================================

export async function generateFinalSummary(
  pageUnderstanding: AgentTestPlan["pageUnderstanding"],
  results: AgentStepResult[],
  totalDuration: number
): Promise<string> {

  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;
  const warnings = results.filter(r => r.status === "warning").length;
  const skipped = results.filter(r => r.status === "skipped").length;

  const prompt = `You are a senior QA analyst for Saudi government websites.

**Website:** ${pageUnderstanding.siteName} (${pageUnderstanding.siteNameAr})
**Type:** ${pageUnderstanding.pageType}
**Description:** ${pageUnderstanding.description}

**Test Results:**
- Total elements tested: ${results.length}
- Passed: ${passed} ✅
- Failed: ${failed} ❌
- Warnings: ${warnings} ⚠️
- Skipped (unsafe): ${skipped} ⏭️
- Total duration: ${(totalDuration / 1000).toFixed(1)}s

**Failed Elements:**
${results.filter(r => r.status === "failed").map(r =>
  `- ${r.testAction.element}: ${r.aiAssessment}`
).join("\n") || "None"}

**Warning Elements:**
${results.filter(r => r.status === "warning").map(r =>
  `- ${r.testAction.element}: ${r.aiAssessment}`
).join("\n") || "None"}

**Slow Elements (>2s):**
${results.filter(r => r.responseTimeMs > 2000).map(r =>
  `- ${r.testAction.element}: ${r.responseTimeMs}ms`
).join("\n") || "None"}

## Write a comprehensive summary:
1. Overall health assessment of the website
2. What works well
3. What's broken and its impact on users
4. Slow elements that hurt user experience
5. Specific recommendations for the site owner
6. Write in BOTH English AND Arabic

Be professional, concise, and actionable.

Format as:
**English Summary:**
[your summary]

**Arabic Summary (الملخص العربي):**
[your summary in Arabic]`;

  try {
    return await callAI(prompt);
  } catch (error) {
    console.error("Failed to generate AI summary, using template:", error);
    return templateSummary(pageUnderstanding, results, totalDuration);
  }
}

// ============================================================
// AI Provider Abstraction (supports Claude + OpenAI)
// ============================================================

async function callAIWithVision(
  prompt: string,
  ...screenshots: Buffer[]
): Promise<string> {
  const provider = detectProvider();

  if (provider === "claude") {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const content: any[] = [];

    // Add screenshots as images
    for (const screenshot of screenshots) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: screenshot.toString("base64"),
        },
      });
    }
    content.push({ type: "text", text: prompt });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    return extractJSON(response.content[0].type === "text" ? response.content[0].text : "");
  }

  if (provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const content: any[] = [];

    for (const screenshot of screenshots) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${screenshot.toString("base64")}`,
          detail: "high",
        },
      });
    }
    content.push({ type: "text", text: prompt });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    return extractJSON(response.choices[0].message.content || "");
  }

  if (provider === "groq") {
    // Groq doesn't support vision — use text-only prompt
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    return extractJSON(response.choices[0].message.content || "");
  }

  // Fallback: no AI — return empty JSON for fallback handling
  return "{}";
}

async function callAI(prompt: string): Promise<string> {
  const provider = detectProvider();

  if (provider === "claude") {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
  }

  if (provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0].message.content || "";
  }

  if (provider === "groq") {
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0].message.content || "";
  }

  return "";
}

function detectProvider(): "claude" | "openai" | "groq" | "none" {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GROQ_API_KEY) return "groq";
  return "none";
}

function extractJSON(text: string): string {
  // Extract JSON from markdown code blocks or raw text
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  return jsonMatch ? jsonMatch[1].trim() : text;
}

// ============================================================
// Fallback Analysis (No AI)
// ============================================================

function fallbackAnalysis(
  url: string,
  metadata: { title: string; description?: string; lang?: string },
  htmlStructure: string
): AgentTestPlan {
  console.log("⚠️ No AI API key detected — using heuristic analysis");

  // Basic page understanding
  const pageUnderstanding = {
    siteName: metadata.title,
    siteNameAr: "",
    pageType: "homepage",
    language: metadata.lang || "unknown",
    description: `Automated test for ${metadata.title}`,
    descriptionAr: `اختبار آلي لـ ${metadata.title}`,
  };

  // Extract elements from HTML structure heuristically
  const elements: AgentTestAction[] = [];
  const lines = htmlStructure.split("\n");
  let id = 1;

  for (const line of lines) {
    if (id > 80) break; // Max 80 elements

    const tag = line.match(/<(\w+)/)?.[1];
    if (!tag) continue;

    const textMatch = line.match(/>([^<]+)</);
    const text = textMatch ? textMatch[1].trim().slice(0, 50) : "";
    if (!text || text.length < 2) continue;

    const hrefMatch = line.match(/href="([^"]+)"/);
    const href = hrefMatch ? hrefMatch[1] : "";

    // Classify element
    let type = "button";
    let action = "click";
    let section = "content";
    let priority: "high" | "medium" | "low" = "medium";

    if (tag === "a") {
      type = "nav-link";
      action = "click";
      if (line.includes("nav")) section = "nav";
      if (line.includes("footer")) section = "footer";
      priority = section === "nav" ? "high" : "low";
    } else if (tag === "button") {
      type = "button";
      action = "click";
      priority = "high";
    } else if (tag === "input") {
      type = "form-input";
      action = "type";
      priority = "medium";
    }

    // Safety check
    const isSafe = !(/login|logout|sign|دخول|خروج|delete|حذف|submit|إرسال|payment|دفع|download|تحميل|nafath|نفاذ/i.test(text));

    elements.push({
      id: id++,
      element: text,
      selector: href ? `a[href="${href}"]` : `${tag}:contains("${text.slice(0, 20)}")`,
      type,
      action,
      reason: `Test ${type} interaction`,
      priority,
      expectedBehavior: `Should ${action} successfully`,
      isSafe,
      section,
    });
  }

  return { pageUnderstanding, elements };
}

function fallbackAssessment(
  testAction: AgentTestAction,
  context: {
    urlChanged: boolean;
    urlBefore: string;
    urlAfter: string;
    consoleErrors: string[];
    networkErrors: string[];
    responseTimeMs: number;
    pageTitle: string;
  }
): { status: string; assessment: string } {

  // Simple heuristic assessment
  if (context.consoleErrors.length > 0 || context.networkErrors.length > 0) {
    return {
      status: "failed",
      assessment: `Errors detected: ${[...context.consoleErrors, ...context.networkErrors].join(", ")}`,
    };
  }

  if (context.responseTimeMs > 3000) {
    return {
      status: "warning",
      assessment: `Element responded but was slow (${context.responseTimeMs}ms)`,
    };
  }

  if (testAction.action === "click" && context.urlChanged) {
    return {
      status: "passed",
      assessment: `Navigation successful (${context.urlBefore} → ${context.urlAfter})`,
    };
  }

  return {
    status: "passed",
    assessment: `Element interaction completed in ${context.responseTimeMs}ms`,
  };
}

function templateSummary(
  pageUnderstanding: AgentTestPlan["pageUnderstanding"],
  results: AgentStepResult[],
  totalDuration: number
): string {
  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;
  const warnings = results.filter(r => r.status === "warning").length;

  const englishSummary = `
**English Summary:**
Tested ${results.length} interactive elements on ${pageUnderstanding.siteName}. ${passed} elements passed, ${failed} failed, and ${warnings} showed warnings. Total test duration: ${(totalDuration / 1000).toFixed(1)}s.

${failed > 0 ? `Critical issues detected that prevent users from accessing key functionality. ` : ""}${warnings > 0 ? `Some elements are slow or showing minor issues. ` : ""}${failed === 0 && warnings === 0 ? `All tested elements are functioning correctly.` : ""}
`;

  const arabicSummary = `
**Arabic Summary (الملخص العربي):**
تم اختبار ${results.length} عنصر تفاعلي على ${pageUnderstanding.siteNameAr || pageUnderstanding.siteName}. نجح ${passed} عنصر، وفشل ${failed}، وأظهر ${warnings} تحذيرات. إجمالي مدة الاختبار: ${(totalDuration / 1000).toFixed(1)}ث.

${failed > 0 ? `تم اكتشاف مشاكل حرجة تمنع المستخدمين من الوصول إلى الوظائف الرئيسية. ` : ""}${warnings > 0 ? `بعض العناصر بطيئة أو تظهر مشاكل بسيطة. ` : ""}${failed === 0 && warnings === 0 ? `جميع العناصر المختبرة تعمل بشكل صحيح.` : ""}
`;

  return englishSummary + "\n" + arabicSummary;
}
