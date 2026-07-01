import { ok } from "@/lib/api";

export function GET() {
  return ok([
    { provider: "openai", model: "gpt-4.1", structuredOutput: true, vision: true, active: true },
    { provider: "anthropic", model: "claude-3-5-sonnet", structuredOutput: true, vision: true, active: true },
    { provider: "gemini", model: "gemini-1.5-pro", structuredOutput: true, vision: true, active: true }
  ]);
}
