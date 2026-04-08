// src/lib/mcp-tools.ts
// MCP-Style Tool Interface for Playwright Browser Control

import { Page } from "playwright";
import { getAccessibilityTree, formatAccessibilityTree } from "./accessibility-tree";

// ============================================================
// Tool Definitions (MCP-Compatible)
// ============================================================

export interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export const PLAYWRIGHT_MCP_TOOLS: MCPTool[] = [
  {
    name: "browser_snapshot",
    description: "Get current page state including screenshot, accessibility tree, and metadata. Use this to understand what's currently visible.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate to a URL. Use this to load pages or follow links.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_click",
    description: "Click an element on the page. Use accessibility role and name to identify the element.",
    input_schema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description: "ARIA role of element (button, link, tab, menuitem, etc.)",
        },
        name: {
          type: "string",
          description: "Accessible name or text content of the element",
        },
        selector: {
          type: "string",
          description: "CSS selector as fallback if role+name doesn't work",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "browser_type",
    description: "Type text into an input field.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the input element",
        },
        text: {
          type: "string",
          description: "Text to type",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page to reveal more content.",
    input_schema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["down", "up"],
          description: "Direction to scroll",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "complete_testing",
    description: "Call this when you've finished testing and want to generate a final report.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of what was tested and findings",
        },
      },
      required: ["summary"],
    },
  },
];

// ============================================================
// Tool Executor
// ============================================================

export interface ToolExecutionContext {
  page: Page;
  baseUrl: string;
  visitedUrls: Set<string>;
  actions: Array<{
    tool: string;
    input: any;
    result: any;
    timestamp: number;
  }>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: Buffer;
}

export async function executeMCPTool(
  toolName: string,
  input: any,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { page, baseUrl } = context;

  try {
    switch (toolName) {
      case "browser_snapshot": {
        // Capture current state
        const screenshot = await page.screenshot({ fullPage: false });
        const accessibilityTree = await getAccessibilityTree(page);
        const formattedTree = formatAccessibilityTree(accessibilityTree);

        const metadata = await page.evaluate(() => ({
          title: document.title,
          url: window.location.href,
          description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        }));

        return {
          success: true,
          data: {
            metadata,
            accessibilityTree: formattedTree,
            viewport: await page.viewportSize(),
          },
          screenshot,
        };
      }

      case "browser_navigate": {
        const targetUrl = input.url;

        // Safety: same-domain check
        if (!isSameDomain(baseUrl, targetUrl)) {
          return {
            success: false,
            error: `Navigation blocked: ${targetUrl} is outside target domain`,
          };
        }

        await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);

        context.visitedUrls.add(targetUrl);

        const screenshot = await page.screenshot({ fullPage: false });

        return {
          success: true,
          data: {
            url: page.url(),
            title: await page.title(),
          },
          screenshot,
        };
      }

      case "browser_click": {
        const { role, name, selector } = input;

        // Try to find element by role + name first
        let element = null;

        if (role && name) {
          try {
            element = page.getByRole(role, { name: new RegExp(name, "i") }).first();
            if (!(await element.isVisible({ timeout: 2000 }))) {
              element = null;
            }
          } catch {}
        }

        // Fallback to text content
        if (!element && name) {
          try {
            element = page.getByText(name, { exact: false }).first();
            if (!(await element.isVisible({ timeout: 2000 }))) {
              element = null;
            }
          } catch {}
        }

        // Fallback to selector
        if (!element && selector) {
          try {
            element = page.locator(selector).first();
            if (!(await element.isVisible({ timeout: 2000 }))) {
              element = null;
            }
          } catch {}
        }

        if (!element) {
          return {
            success: false,
            error: `Element not found: ${role || ""}${name ? ` "${name}"` : ""}${selector ? ` (${selector})` : ""}`,
          };
        }

        // Safety: check if link goes outside domain
        const href = await element.getAttribute("href").catch(() => null);
        if (href) {
          const absoluteUrl = new URL(href, page.url()).href;
          if (!isSameDomain(baseUrl, absoluteUrl)) {
            return {
              success: false,
              error: `Click blocked: target ${absoluteUrl} is outside domain`,
            };
          }
        }

        // Scroll into view and click
        await element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        const beforeUrl = page.url();
        await element.click({ timeout: 5000 });
        await page.waitForTimeout(2000);

        const afterUrl = page.url();
        const screenshot = await page.screenshot({ fullPage: false });

        return {
          success: true,
          data: {
            urlChanged: beforeUrl !== afterUrl,
            beforeUrl,
            afterUrl,
            element: name || selector || "unknown",
          },
          screenshot,
        };
      }

      case "browser_type": {
        const { selector, text } = input;

        const element = page.locator(selector).first();
        if (!(await element.isVisible({ timeout: 2000 }))) {
          return {
            success: false,
            error: `Input element not found: ${selector}`,
          };
        }

        await element.scrollIntoViewIfNeeded();
        await element.fill(text);
        await page.waitForTimeout(1000);

        const screenshot = await page.screenshot({ fullPage: false });

        return {
          success: true,
          data: {
            selector,
            text: text.substring(0, 50),
          },
          screenshot,
        };
      }

      case "browser_scroll": {
        const { direction } = input;
        const scrollAmount = direction === "down" ? 500 : -500;

        await page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, scrollAmount);

        await page.waitForTimeout(1000);

        const screenshot = await page.screenshot({ fullPage: false });

        return {
          success: true,
          data: {
            direction,
            scrollY: await page.evaluate(() => window.scrollY),
          },
          screenshot,
        };
      }

      case "complete_testing": {
        return {
          success: true,
          data: {
            summary: input.summary,
            totalActions: context.actions.length,
            visitedUrls: Array.from(context.visitedUrls),
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Tool execution failed: ${error.message}`,
    };
  }
}

// ============================================================
// Safety Helpers
// ============================================================

function isSameDomain(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    return target.hostname === base.hostname || target.hostname.endsWith("." + base.hostname);
  } catch {
    return false;
  }
}
