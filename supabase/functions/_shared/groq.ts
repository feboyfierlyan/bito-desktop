import {
  ApiError,
  sseData,
  toolDeclarations,
  toolNames,
  type Content,
  type Part,
  type ToolCall,
} from "./protocol.ts";
import type { generateGemini } from "./gemini.ts";

// Server-owned endpoint/model: clients cannot choose a destination for this key.
export const GROQ_MODEL = "qwen/qwen3.8-27b";
const endpoint = "https://api.groq.com/openai/v1/chat/completions";

function schema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "type" && typeof item === "string"
        ? item.toLowerCase()
        : schema(item),
    ]),
  );
}

export function groqMessages(contents: Content[], instructions: string) {
  const messages: Record<string, unknown>[] = [
    { role: "system", content: instructions },
  ];
  for (const entry of contents) {
    const text = entry.parts
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join("");
    const calls = entry.parts.flatMap((p) =>
      p.functionCall ? [p.functionCall] : [],
    );
    const results = entry.parts.flatMap((p) =>
      p.functionResponse ? [p.functionResponse] : [],
    );
    if (entry.role === "model") {
      messages.push({
        role: "assistant",
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((call) => {
                if (!call.id) throw new ApiError("invalid_job", 409);
                return {
                  id: call.id,
                  type: "function",
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.args),
                  },
                };
              }),
            }
          : {}),
      });
    } else if (results.length) {
      for (const result of results) {
        if (!result.id) throw new ApiError("invalid_job", 409);
        messages.push({
          role: "tool",
          tool_call_id: result.id,
          content: JSON.stringify(result.response),
        });
      }
      if (text) messages.push({ role: "user", content: text });
    } else messages.push({ role: "user", content: text });
  }
  return messages;
}

export const generateGroq: typeof generateGemini = async (options) => {
  if (options.model !== GROQ_MODEL) throw new ApiError("server_config", 503);
  const { job, signal, emit } = options;
  const response = await (options.fetcher || fetch)(endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: groqMessages(job.contents, job.instructions),
      tools: toolDeclarations.map((tool) => ({
        type: "function",
        function: { ...tool, parameters: schema(tool.parameters) },
      })),
      tool_choice: job.round >= 4 ? "none" : "auto",
      parallel_tool_calls: false,
      reasoning_effort: "none",
      reasoning_format: "hidden",
      temperature: 0.7,
      top_p: 0.8,
      max_completion_tokens: 1024,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(
      response.status === 429 ? "provider_limit" : "provider_error",
      response.status === 429 ? 429 : 502,
    );
  }
  if (!response.body) throw new ApiError("provider_error", 502);
  let text = "",
    finish = "",
    input = 0,
    output = 0,
    size = 0;
  const pending = new Map<number, { name: string; arguments: string }>();
  for await (const data of sseData(response.body)) {
    signal.throwIfAborted();
    if (data === "[DONE]") break;
    size += data.length;
    if (size > 160000) throw new ApiError("response_too_large", 502);
    const chunk = JSON.parse(data);
    if (chunk.error) throw new ApiError("provider_error", 502);
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    // Only final answer content reaches the desktop; reasoning is never emitted.
    if (typeof delta?.content === "string") {
      text += delta.content;
      if (text.length > 24000) throw new ApiError("response_too_large", 502);
      emit(delta.content);
    }
    for (const call of delta?.tool_calls || []) {
      if (
        !Number.isInteger(call.index) ||
        call.index < 0 ||
        call.index >= 3 ||
        job.round >= 4
      )
        throw new ApiError("invalid_tool", 502);
      const accumulated = pending.get(call.index) || {
        name: "",
        arguments: "",
      };
      if (call.function?.name !== undefined) {
        if (typeof call.function.name !== "string")
          throw new ApiError("invalid_tool", 502);
        accumulated.name += call.function.name;
      }
      if (call.function?.arguments !== undefined) {
        if (typeof call.function.arguments !== "string")
          throw new ApiError("invalid_tool", 502);
        accumulated.arguments += call.function.arguments;
      }
      if (accumulated.name.length > 100 || accumulated.arguments.length > 80000)
        throw new ApiError("response_too_large", 502);
      pending.set(call.index, accumulated);
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    input =
      chunk.usage?.prompt_tokens ?? chunk.x_groq?.usage?.prompt_tokens ?? input;
    output =
      chunk.usage?.completion_tokens ??
      chunk.x_groq?.usage?.completion_tokens ??
      output;
  }
  if (finish !== "stop" && finish !== "tool_calls")
    throw new ApiError(
      finish === "length" ? "response_limit" : "incomplete_response",
      502,
    );
  if (pending.size > 0 !== (finish === "tool_calls"))
    throw new ApiError("invalid_tool", 502);
  const calls: ToolCall[] = [];
  const parts: Part[] = text ? [{ text }] : [];
  for (const [index, call] of [...pending.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    if (index !== calls.length || !toolNames.includes(call.name as any))
      throw new ApiError("invalid_tool", 502);
    let args: unknown;
    try {
      args = JSON.parse(call.arguments);
    } catch {
      throw new ApiError("invalid_tool", 502);
    }
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw new ApiError("invalid_tool", 502);
    const id = crypto.randomUUID();
    const validated = {
      id,
      name: call.name as ToolCall["name"],
      args: args as Record<string, unknown>,
    };
    calls.push(validated);
    // One stable UUID connects the local receipt, stored call and resumed result.
    parts.push({ functionCall: validated });
  }
  if (!text && !calls.length) throw new ApiError("empty_response", 502);
  if (JSON.stringify(parts).length > 80000)
    throw new ApiError("response_too_large", 502);
  return { text, calls, parts, input, output };
};
