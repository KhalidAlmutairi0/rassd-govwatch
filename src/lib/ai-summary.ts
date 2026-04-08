// src/lib/ai-summary.ts
import { callAI, getCurrentProvider } from "./ai";
import { StepResult } from "./executor";

interface RunSummary {
  executive: string;
  executiveAr: string;
  technicalDetails: string;
  recommendations: string[];
}

export async function generateRunSummary(
  siteUrl: string,
  siteName: string,
  overallStatus: "passed" | "failed" | "error",
  steps: StepResult[],
  durationMs: number
): Promise<RunSummary> {
  const provider = getCurrentProvider();

  // If no AI provider, use template
  if (provider === "template") {
    return generateTemplateSummary(siteName, overallStatus, steps, durationMs);
  }

  const passed = steps.filter((s) => s.status === "passed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const errors = steps.filter((s) => s.error).map((s) => ({
    step: s.stepIndex,
    error: s.error,
  }));

  const prompt = `You are a QA engineer analyzing test results for a Saudi government website.

SITE: ${siteName} (${siteUrl})
OVERALL STATUS: ${overallStatus}
DURATION: ${(durationMs / 1000).toFixed(1)}s
STEPS: ${passed} passed, ${failed} failed
ERRORS: ${JSON.stringify(errors)}

Generate a test summary in JSON format with these fields:
- executive: Brief summary in English (2-3 sentences, executive-friendly)
- executiveAr: Same summary in Arabic
- technicalDetails: Technical details of what failed (if any)
- recommendations: Array of 2-4 actionable recommendations for the site owner

Be concise and professional. Return ONLY valid JSON.`;

  try {
    const response = await callAI(prompt);
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    const summary = JSON.parse(jsonStr);
    return summary as RunSummary;
  } catch (error) {
    console.warn("AI summary generation failed, using template");
    return generateTemplateSummary(siteName, overallStatus, steps, durationMs);
  }
}

// Template-based summary (no AI needed)
function generateTemplateSummary(
  siteName: string,
  overallStatus: "passed" | "failed" | "error",
  steps: StepResult[],
  durationMs: number
): RunSummary {
  const passed = steps.filter((s) => s.status === "passed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const errors = steps
    .filter((s) => s.error)
    .map((s) => s.error!)
    .join("; ");

  if (overallStatus === "passed") {
    return {
      executive: `All ${passed} test steps passed successfully for ${siteName} in ${(durationMs / 1000).toFixed(1)}s. The website is functioning normally.`,
      executiveAr: `نجحت جميع خطوات الاختبار الـ ${passed} لموقع ${siteName} في ${(durationMs / 1000).toFixed(1)} ثانية. الموقع يعمل بشكل طبيعي.`,
      technicalDetails: "All assertions passed. No issues detected.",
      recommendations: [
        "Continue monitoring to ensure consistent uptime",
        "Review performance metrics regularly",
      ],
    };
  }

  if (overallStatus === "error") {
    return {
      executive: `Critical error encountered while testing ${siteName}. The test run could not complete successfully.`,
      executiveAr: `حدث خطأ حرج أثناء اختبار ${siteName}. لم يكتمل تشغيل الاختبار بنجاح.`,
      technicalDetails: errors || "Unknown error occurred",
      recommendations: [
        "Investigate server errors or connectivity issues",
        "Check if website is accessible",
        "Review server logs for more details",
      ],
    };
  }

  // Failed
  return {
    executive: `${passed} of ${passed + failed} test steps passed for ${siteName}. ${failed} step(s) failed. Duration: ${(durationMs / 1000).toFixed(1)}s.`,
    executiveAr: `نجحت ${passed} من أصل ${passed + failed} خطوة اختبار لموقع ${siteName}. فشلت ${failed} خطوة. المدة: ${(durationMs / 1000).toFixed(1)} ثانية.`,
    technicalDetails: `Issues detected: ${errors}`,
    recommendations: [
      "Review failed test steps for specific issues",
      "Check browser console for JavaScript errors",
      "Verify page elements are loading correctly",
      "Consider accessibility and performance improvements",
    ],
  };
}

export type { RunSummary };
