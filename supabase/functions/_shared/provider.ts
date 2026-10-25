import { generateGemini } from "./gemini.ts";
import { generateGroq, GROQ_MODEL } from "./groq.ts";

/** Owner configuration only. A Groq key opts in to Qwen; no silent model fallback
 * after an error or exhausted quota. Explicitly choose gemini to roll back. */
export function providerConfig(env: (name: string) => string | undefined) {
  const provider =
    env("BITO_AI_PROVIDER") || (env("GROQ_API_KEY") ? "groq" : "gemini");
  if (provider === "groq")
    return {
      key: env("GROQ_API_KEY") || "",
      model: GROQ_MODEL,
      generate: generateGroq,
    };
  if (provider === "gemini")
    return {
      key: env("GEMINI_API_KEY") || "",
      model: env("GEMINI_MODEL") || "gemini-3.5-flash-lite",
      generate: generateGemini,
    };
  return { key: "", model: "", generate: generateGemini };
}
