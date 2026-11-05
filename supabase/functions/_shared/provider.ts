import { generateGemini } from "./gemini.ts";
import { generateGroq, GROQ_MODEL } from "./groq.ts";

export const GEMINI_MODEL = "gemini-3.8-flash";

/** Owner configuration only. Gemini is the default; Qwen stays available by
 * explicit opt-in. Never switch provider automatically after an error. */
export function providerConfig(env: (name: string) => string | undefined) {
  const provider = env("BITO_AI_PROVIDER") || "gemini";
  if (provider === "groq")
    return {
      key: env("GROQ_API_KEY") || "",
      model: GROQ_MODEL,
      generate: generateGroq,
    };
  if (provider === "gemini")
    return {
      key: env("GEMINI_API_KEY") || "",
      model: env("GEMINI_MODEL") || GEMINI_MODEL,
      generate: generateGemini,
    };
  return { key: "", model: "", generate: generateGemini };
}
