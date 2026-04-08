// src/lib/test-generator.ts
import { TestStep, TestStepsArraySchema } from "./validators";
import { PageMetadata } from "./page-analyzer";

export function generateSmokeTest(
  baseUrl: string,
  metadata: PageMetadata
): TestStep[] {
  const steps: TestStep[] = [];

  // ── Step 1: Open homepage ──
  steps.push({
    action: "navigate",
    description: "Open homepage",
    url: baseUrl,
    assertions: ["page_loaded", "title_exists"],
  });

  steps.push({
    action: "screenshot",
    description: "Capture homepage",
  });

  // ── Step 2: Assert main heading ──
  if (metadata.mainHeading) {
    steps.push({
      action: "assert_element",
      description: `Verify main heading: "${metadata.mainHeading.substring(0, 50)}"`,
      selector: "h1",
      assertions: ["element_visible"],
    });
  }

  // ── Step 3: Navigation test (up to 5 links) ──
  const navLinks =
    metadata.navigationLinks.length > 0
      ? metadata.navigationLinks
      : metadata.internalLinks;

  const linksToTest = navLinks
    .filter((link) => {
      const url = link.href.toLowerCase();
      // Skip auth, login, logout, destructive pages
      return (
        !url.includes("login") &&
        !url.includes("logout") &&
        !url.includes("signin") &&
        !url.includes("signout") &&
        !url.includes("register") &&
        !url.includes("delete") &&
        !url.includes("admin") &&
        !url.includes("nafath") &&
        !url.includes("oauth") &&
        !url.includes("auth")
      );
    })
    .slice(0, 5);

  for (const link of linksToTest) {
    steps.push({
      action: "navigate",
      description: `Navigate to "${link.text}"`,
      url: link.href,
      assertions: ["page_loaded", "status_200"],
    });
    steps.push({
      action: "screenshot",
      description: `Capture "${link.text}" page`,
    });
  }

  // ── Step 4: Search test ──
  if (metadata.searchInputs.length > 0 && !metadata.hasCaptcha) {
    const searchInput = metadata.searchInputs[0];
    steps.push({
      action: "navigate",
      description: "Return to homepage for search test",
      url: baseUrl,
    });
    steps.push({
      action: "type",
      description: "Type search query",
      selector: searchInput.selector,
      value: metadata.language === "ar" ? "خدمات" : "services",
    });
    steps.push({
      action: "screenshot",
      description: "Capture search results",
    });
  }

  // ── Step 5: Form detection (NO SUBMIT) ──
  if (metadata.forms.length > 0) {
    steps.push({
      action: "detect_forms",
      description: `Detected ${metadata.forms.length} form(s) — presence check only (no submission)`,
      assertions: ["form_exists"],
    });
  }

  // Validate all steps
  const validated = TestStepsArraySchema.parse(steps);
  return validated;
}
