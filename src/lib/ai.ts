// src/lib/ai.ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

type AIProvider = "claude" | "openai" | "template";

function getAIProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "template";
}

export async function callAI(prompt: string): Promise<string> {
  const provider = getAIProvider();

  try {
    switch (provider) {
      case "claude":
        return await callClaude(prompt);
      case "openai":
        return await callOpenAI(prompt);
      default:
        return "AI service not available - using template mode";
    }
  } catch (error) {
    console.error("AI call failed:", error);
    return "AI service error - using fallback";
  }
}

// Claude implementation
async function callClaude(prompt: string): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const firstBlock = response.content[0];
  return firstBlock.type === "text" ? firstBlock.text : "";
}

// OpenAI implementation
async function callOpenAI(prompt: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
  });

  return response.choices[0].message.content || "";
}

// Get the current AI provider being used
export function getCurrentProvider(): AIProvider {
  return getAIProvider();
}
