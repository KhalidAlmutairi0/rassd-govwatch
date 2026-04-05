// src/lib/ai-agent-mcp.ts
// MCP-Based AI Agent — Iterative decision making with tool use

import Anthropic from "@anthropic-ai/sdk";
import { PLAYWRIGHT_MCP_TOOLS } from "./mcp-tools";

// ============================================================
// MCP Agent — Iterative Browser Testing
// ============================================================

export interface MCPAgentConfig {
  url: string;
  maxIterations?: number;  // Default: 50
  systemPrompt?: string;
}

export interface MCPAgentStep {
  iteration: number;
  thought: string;
  toolName: string;
  toolInput: any;
  toolResult: any;
  screenshot?: string;  // base64
  timestamp: number;
}

export interface MCPAgentResult {
  steps: MCPAgentStep[];
  finalSummary: string;
  totalIterations: number;
  status: "completed" | "max_iterations" | "error";
}

/**
 * Run MCP-based iterative testing session
 * The AI observes → decides → acts → observes → repeats
 */
export async function runMCPAgent(
  config: MCPAgentConfig,
  onToolCall: (toolName: string, input: any) => Promise<{ success: boolean; data?: any; error?: string; screenshot?: Buffer }>
): Promise<MCPAgentResult> {
  const { url, maxIterations = 50 } = config;

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = config.systemPrompt || createDefaultSystemPrompt(url);

  const steps: MCPAgentStep[] = [];
  const messages: Anthropic.MessageParam[] = [];

  let iteration = 0;
  let isComplete = false;

  // Start with initial browser_snapshot
  const initialSnapshot = await onToolCall("browser_snapshot", {});

  if (!initialSnapshot.success) {
    return {
      steps: [],
      finalSummary: `Failed to load page: ${initialSnapshot.error}`,
      totalIterations: 0,
      status: "error",
    };
  }

  // Add initial user message with snapshot
  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `I've loaded the page ${url}. Here's what I see:\n\n**Page Title:** ${initialSnapshot.data?.metadata?.title}\n**URL:** ${initialSnapshot.data?.metadata?.url}\n**Description:** ${initialSnapshot.data?.metadata?.description}\n\n**Accessibility Tree:**\n\`\`\`\n${initialSnapshot.data?.accessibilityTree?.substring(0, 3000) || "N/A"}\n\`\`\`\n\nPlease start testing this government website. Use the available tools to explore and test it.`,
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: initialSnapshot.screenshot!.toString("base64"),
        },
      },
    ],
  });

  // Iterative loop
  while (iteration < maxIterations && !isComplete) {
    iteration++;

    try {
      // Call Claude with tool use
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools: PLAYWRIGHT_MCP_TOOLS as any,
      });

      // Add assistant response to messages
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // Check if AI wants to use tools
      const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");

      if (toolUseBlocks.length === 0) {
        // No tools used — AI is done or just thinking
        const textBlock = response.content.find((block) => block.type === "text");
        if (textBlock && textBlock.type === "text") {
          isComplete = true;
          break;
        }
        continue;
      }

      // Execute each tool
      const toolResults: any[] = [];

      for (const toolBlock of toolUseBlocks) {
        if (toolBlock.type !== "tool_use") continue;

        const toolName = toolBlock.name;
        const toolInput = toolBlock.input;
        const toolUseId = toolBlock.id;

        // Check if AI wants to complete
        if (toolName === "complete_testing") {
          isComplete = true;
          steps.push({
            iteration,
            thought: "Testing complete",
            toolName,
            toolInput,
            toolResult: { success: true, summary: toolInput.summary },
            timestamp: Date.now(),
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify({ success: true, message: "Testing completed successfully" }),
          });
          break;
        }

        // Execute tool
        const result = await onToolCall(toolName, toolInput);

        // Record step
        steps.push({
          iteration,
          thought: "", // We could extract this from text blocks
          toolName,
          toolInput,
          toolResult: result,
          screenshot: result.screenshot?.toString("base64"),
          timestamp: Date.now(),
        });

        // Add tool result for Claude
        if (result.success) {
          const contentParts: any[] = [
            {
              type: "text",
              text: JSON.stringify(result.data || { success: true }),
            },
          ];

          // Include screenshot if available
          if (result.screenshot && toolName !== "complete_testing") {
            contentParts.push({
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: result.screenshot.toString("base64"),
              },
            });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: contentParts,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify({ error: result.error }),
            is_error: true,
          });
        }
      }

      // Add tool results to conversation
      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: toolResults,
        });
      }

      if (isComplete) break;

    } catch (error: any) {
      console.error(`MCP Agent error at iteration ${iteration}:`, error);
      return {
        steps,
        finalSummary: `Error during testing: ${error.message}`,
        totalIterations: iteration,
        status: "error",
      };
    }
  }

  // Generate final summary
  let finalSummary = "Testing completed.";
  const completeStep = steps.find((s) => s.toolName === "complete_testing");
  if (completeStep) {
    finalSummary = completeStep.toolInput.summary || finalSummary;
  } else if (iteration >= maxIterations) {
    finalSummary = `Reached maximum iterations (${maxIterations}). Testing stopped.`;
  }

  return {
    steps,
    finalSummary,
    totalIterations: iteration,
    status: isComplete ? "completed" : "max_iterations",
  };
}

// ============================================================
// System Prompt
// ============================================================

function createDefaultSystemPrompt(url: string): string {
  return `You are an expert QA tester for Saudi government websites. Your job is to thoroughly test ${url} using the available browser control tools.

## YOUR MISSION:

Test this website comprehensively by:
1. **Exploring navigation** - Test all major navigation links, menus, tabs
2. **Testing interactions** - Click buttons, dropdowns, accordions, carousels
3. **Checking functionality** - Try search, forms (without submitting), language switchers
4. **Verifying accessibility** - Ensure important elements are accessible and functional
5. **Looking for issues** - Identify broken links, missing content, errors, slow loading

## AVAILABLE TOOLS:

- **browser_snapshot**: Get current page state (screenshot + accessibility tree)
- **browser_navigate**: Go to a URL
- **browser_click**: Click an element (use role + name for best results)
- **browser_type**: Type text into inputs (for search, NOT for form submission)
- **browser_scroll**: Scroll to reveal more content
- **complete_testing**: Call this when you're done testing

## SAFETY RULES — NEVER:

❌ Navigate outside the target domain
❌ Submit forms (typing in search is OK, but don't submit registration/login forms)
❌ Click login, logout, signup, delete, purchase, payment buttons
❌ Click links containing: "login", "signin", "register", "delete", "admin", "nafath", "oauth"
❌ Type sensitive data (passwords, personal info)

## TESTING STRATEGY:

1. Start with homepage — understand the site structure
2. Test main navigation — visit 5-8 important pages
3. Test interactive elements — dropdowns, tabs, accordions, etc.
4. Test search if available (type query, don't submit form)
5. Check secondary navigation — footer links, sidebars
6. Look for any obvious issues

After testing 15-25 elements or visiting 8-12 pages, call **complete_testing** with a summary.

## HOW TO USE TOOLS:

### To click an element:
\`\`\`json
{
  "role": "button",  // or "link", "tab", "menuitem"
  "name": "الخدمات"  // The visible text or accessible name
}
\`\`\`

### To navigate:
\`\`\`json
{
  "url": "https://example.gov.sa/page"
}
\`\`\`

### When done:
\`\`\`json
{
  "summary": "Tested homepage, navigation (5 links), search, and dropdowns. All working. No errors found."
}
\`\`\`

## IMPORTANT:

- Be systematic and thorough
- Test the most important functionality first
- If an element fails, note it and move on
- Use accessibility tree to find elements reliably
- Call complete_testing when you've covered the main functionality

Start testing now!`;
}
