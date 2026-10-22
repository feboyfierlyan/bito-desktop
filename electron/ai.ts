import OpenAI from "openai";
type Options = {
  apiKey: string;
  baseURL: string;
  model: string;
  instructions: string;
  history: any[];
  tools: any[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  executeTool: (name: string, args: unknown) => string;
};
// This transport is independent of Electron so streaming, tool loops and cancellation
// can be exercised against a local test server without sending user data or using a key.
export async function generateReply(options: Options) {
  const {
    apiKey,
    baseURL,
    model,
    instructions,
    tools,
    signal,
    onDelta,
    executeTool,
  } = options;
  const history = [...options.history];
  let output = "";
  const client = new OpenAI({ apiKey, baseURL, timeout: 90000, maxRetries: 1 });
  for (let round = 0; round < 4; round++) {
    const stream = await client.responses.create(
      {
        model,
        instructions,
        input: history,
        tools,
        stream: true,
        store: false,
        max_output_tokens: 4000,
      },
      { signal },
    );
    let completed: any;
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        output += event.delta;
        onDelta(event.delta);
      }
      if (event.type === "response.completed") completed = event.response;
      if (
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      )
        throw Error(
          "AI belum bisa menyelesaikan jawaban. Coba lagi dengan permintaan lebih singkat.",
        );
    }
    if (!completed) throw Error("Koneksi terputus sebelum jawaban selesai.");
    const calls = completed.output.filter(
      (item: any) => item.type === "function_call",
    );
    if (!calls.length) return output;
    history.push(...completed.output);
    for (const call of calls) {
      signal.throwIfAborted();
      let result: string;
      try {
        result = executeTool(call.name, JSON.parse(call.arguments));
      } catch {
        result = "Action failed: invalid arguments.";
      }
      history.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: result,
      });
    }
  }
  if (!output)
    throw Error(
      "Batas langkah tindakan tercapai. Periksa hasil di panel aktivitas sebelum mencoba lagi.",
    );
  return output;
}
