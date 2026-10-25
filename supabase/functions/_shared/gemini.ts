import {
  ApiError,
  sseData,
  toolDeclarations,
  toolNames,
  type Job,
  type Part,
  type ToolCall,
} from "./protocol.ts";

export async function generateGemini(options: {
  key: string;
  model: string;
  job: Job;
  signal: AbortSignal;
  emit: (text: string) => void;
  fetcher?: typeof fetch;
}) {
  const { job, signal, emit } = options;
  if (!/^[a-z0-9.-]+$/.test(options.model))
    throw new ApiError("server_config", 503);
  const response = await (options.fetcher || fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.key,
      },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: job.instructions }] },
        contents: job.contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        toolConfig: {
          functionCallingConfig: { mode: job.round >= 4 ? "NONE" : "AUTO" },
        },
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(
      response.status === 429 ? "provider_limit" : "provider_error",
      response.status === 429 ? 429 : 502,
    );
  }
  if (!response.body) throw new ApiError("provider_error", 502);
  const parts: Part[] = [];
  let text = "",
    finish = "",
    input = 0,
    output = 0;
  for await (const data of sseData(response.body)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (data === "[DONE]") continue;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new ApiError("provider_error", 502);
    if (chunk.promptFeedback?.blockReason) throw new ApiError("blocked", 422);
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts || []) {
      // Preserve full parts, including opaque thought signatures, for tool resume.
      parts.push(part);
      if (part.text && !part.thought) {
        text += part.text;
        emit(part.text);
      }
      if (text.length > 24000 || JSON.stringify(parts).length > 80000)
        throw new ApiError("response_too_large", 502);
    }
    if (candidate?.finishReason) finish = candidate.finishReason;
    input = chunk.usageMetadata?.promptTokenCount ?? input;
    output = chunk.usageMetadata?.candidatesTokenCount ?? output;
  }
  if (finish !== "STOP")
    throw new ApiError(
      finish === "MAX_TOKENS" ? "response_limit" : "incomplete_response",
      502,
    );
  const calls: ToolCall[] = [];
  for (const part of parts)
    if (part.functionCall) {
      const call = part.functionCall;
      if (
        !toolNames.includes(call.name as any) ||
        calls.length >= 3 ||
        !call.args ||
        Array.isArray(call.args)
      )
        throw new ApiError("invalid_tool", 502);
      calls.push({
        id: crypto.randomUUID(),
        name: call.name as ToolCall["name"],
        args: call.args,
      });
    }
  if (!text && !calls.length) throw new ApiError("empty_response", 502);
  return { text, calls, parts, input, output };
}
