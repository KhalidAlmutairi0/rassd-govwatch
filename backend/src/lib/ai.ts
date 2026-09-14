// src/lib/ai.ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

type AIProvider = "azure" | "claude" | "openai" | "template";

function getAIProvider(): AIProvider {
  if (process.env.AZURE_OPENAI_API_KEY) return "azure";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "template";
}

export async function callAI(prompt: string): Promise<string> {
  const provider = getAIProvider();

  try {
    switch (provider) {
      case "azure":
        return await callAzure(prompt);
      case "claude":
        return await callClaude(prompt);
      case "openai":
        return await callOpenAI(prompt);
      default:
        return "";
    }
  } catch (error) {
    console.error("AI call failed:", error);
    return "";
  }
}

async function callAzure(prompt: string): Promise<string> {
  const baseURL = process.env.AZURE_OPENAI_ENDPOINT;
  const model = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!baseURL || !model) throw new Error("Azure requires AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT");

  const client = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL,
    timeout: 30_000,
    maxRetries: 0,
  });
  const response = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: 2048,
    reasoning: { effort: "low" },
    store: false,
  });
  return response.output_text || "";
}

// Claude implementation
async function callClaude(prompt: string): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 10_000,
    maxRetries: 0,
  });

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const firstBlock = response.content[0];
  return firstBlock?.type === "text" ? firstBlock.text : "";
}

// OpenAI implementation
async function callOpenAI(prompt: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 10_000,
    maxRetries: 0,
  });

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
  });

  return response.choices[0]?.message.content || "";
}

// Get the current AI provider being used
export function getCurrentProvider(): AIProvider {
  return getAIProvider();
}
