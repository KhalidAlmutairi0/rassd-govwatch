// src/lib/page-analyzer.ts
import * as cheerio from "cheerio";

export interface PageMetadata {
  title: string;
  language: string; // "ar" | "en" | "unknown"
  description: string;
  internalLinks: Array<{ text: string; href: string }>;
  searchInputs: Array<{ selector: string; placeholder: string }>;
  forms: Array<{
    action: string;
    method: string;
    fields: Array<{ name: string; type: string; required: boolean }>;
  }>;
  hasLogin: boolean;
  hasCaptcha: boolean;
  mainHeading: string;
  navigationLinks: Array<{ text: string; href: string }>;
}

export async function analyzePage(
  html: string,
  baseUrl: string
): Promise<PageMetadata> {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  // Extract internal links (same domain only)
  const internalLinks: PageMetadata["internalLinks"] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;
    try {
      const url = new URL(href, baseUrl);
      if (
        url.hostname === base.hostname ||
        url.hostname.endsWith("." + base.hostname)
      ) {
        internalLinks.push({
          text: text.substring(0, 100),
          href: url.toString(),
        });
      }
    } catch {}
  });

  // Extract navigation links (from nav elements)
  const navigationLinks: PageMetadata["navigationLinks"] = [];
  $("nav a[href], header a[href], [role=navigation] a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.hostname === base.hostname) {
        navigationLinks.push({
          text: text.substring(0, 100),
          href: url.toString(),
        });
      }
    } catch {}
  });

  // Detect search inputs
  const searchInputs: PageMetadata["searchInputs"] = [];
  $(
    'input[type="search"], input[placeholder*="search" i], input[placeholder*="بحث"], input[name*="search" i], input[aria-label*="search" i], input[aria-label*="بحث"]'
  ).each((_, el) => {
    const placeholder = $(el).attr("placeholder") || "";
    const name = $(el).attr("name") || "";
    const type = $(el).attr("type") || "text";
    const selector = buildSelector($, el);
    searchInputs.push({ selector, placeholder: placeholder || name || type });
  });

  // Detect forms
  const forms: PageMetadata["forms"] = [];
  $("form").each((_, el) => {
    const action = $(el).attr("action") || "";
    const method = $(el).attr("method") || "GET";
    const fields: PageMetadata["forms"][0]["fields"] = [];
    $(el)
      .find("input, select, textarea")
      .each((_, field) => {
        fields.push({
          name: $(field).attr("name") || "",
          type: $(field).attr("type") || "text",
          required: $(field).attr("required") !== undefined,
        });
      });
    forms.push({ action, method, fields });
  });

  // Detect login/auth pages
  const hasLogin =
    $(
      'input[type="password"], [class*="login"], [id*="login"], [class*="signin"]'
    ).length > 0;

  // Detect CAPTCHA
  const hasCaptcha =
    $(
      '[class*="captcha"], [id*="captcha"], [class*="recaptcha"], iframe[src*="captcha"]'
    ).length > 0;

  return {
    title: $("title").text().trim(),
    language:
      $("html").attr("lang") || ($("html").attr("dir") === "rtl" ? "ar" : "unknown"),
    description: $('meta[name="description"]').attr("content") || "",
    internalLinks: deduplicateLinks(internalLinks).slice(0, 20),
    searchInputs,
    forms,
    hasLogin,
    hasCaptcha,
    mainHeading: $("h1").first().text().trim(),
    navigationLinks: deduplicateLinks(navigationLinks).slice(0, 10),
  };
}

// Helper: Build a safe CSS selector for an element
function buildSelector($: cheerio.CheerioAPI, el: cheerio.Element): string {
  const id = $(el).attr("id");
  if (id && /^[a-zA-Z][\w\-]*$/.test(id)) {
    return `#${id}`;
  }

  const name = $(el).attr("name");
  if (name) {
    return `[name="${name}"]`;
  }

  const type = $(el).attr("type");
  const placeholder = $(el).attr("placeholder");
  if (type && placeholder) {
    return `input[type="${type}"][placeholder*="${placeholder.substring(0, 20)}"]`;
  }

  if (type) {
    return `input[type="${type}"]`;
  }

  return el.tagName || "input";
}

// Helper: Remove duplicate links
function deduplicateLinks(
  links: Array<{ text: string; href: string }>
): Array<{ text: string; href: string }> {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}
