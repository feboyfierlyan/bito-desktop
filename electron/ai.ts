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

async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of block.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          yield JSON.parse(payload);
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== "[DONE]") yield JSON.parse(payload);
    }
  } finally {
    reader.releaseLock();
  }
}

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
  const endpoint = `${baseURL.replace(/\/+$/, "")}/responses`;

  for (let round = 0; round < 4; round++) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input: history,
        tools,
        stream: true,
        store: false,
        max_output_tokens: 4000,
      }),
      signal,
    });
    if (!response.ok || !response.body) {
      throw Error(
        "AI belum bisa menyelesaikan jawaban. Coba lagi dengan permintaan lebih singkat.",
      );
    }
    let completed: any;
    for await (const event of parseSseEvents(response.body, signal)) {
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
