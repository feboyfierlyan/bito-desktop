import {
  ApiError,
  appendResults,
  object,
  prepareContext,
  uuid,
  validateResults,
  type Job,
  type ChatEvent,
} from "./protocol.ts";
import { generateGemini } from "./gemini.ts";

export type Identity = { id: string; email: string; confirmed: boolean };
export interface Repository {
  authenticate(token: string): Promise<Identity>;
  claim(user: Identity): Promise<boolean>;
  reserve(
    uid: string,
    device: string,
    id: string,
    context: { contents: unknown; instructions?: string },
    round?: number,
  ): Promise<Job>;
  get(uid: string, device: string, id: string): Promise<Job>;
  finish(
    job: Job,
    status: string,
    contents?: unknown,
    pending?: unknown,
    usage?: { input: number; output: number },
  ): Promise<boolean>;
  cancel(uid: string, device: string, id: string): Promise<void>;
}
export type HandlerOptions = {
  repository: Repository;
  key: string;
  model: string;
  generate?: typeof generateGemini;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError("invalid_request", 415);
  if (Number(request.headers.get("content-length")) > 100000)
    throw new ApiError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) throw new ApiError("request_too_large", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(JSON.parse(new TextDecoder().decode(all)));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("invalid_request");
  }
}
export function createHandler(options: HandlerOptions) {
  const db = options.repository;
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST")
        throw new ApiError("method_not_allowed", 405);
      const bearer = /^Bearer ([^\s]+)$/.exec(
        request.headers.get("authorization") || "",
      );
      if (!bearer || bearer[1].length > 16000)
        throw new ApiError("sign_in_required", 401);
      const user = await db.authenticate(bearer[1]);
      if (
        !uuid(user.id) ||
        !user.confirmed ||
        !user.email ||
        !(await db.claim(user))
      )
        throw new ApiError("access_denied", 403);
      const p = await readBody(request);
      if (p.action === "session")
        return json({
          user: { id: user.id, email: user.email },
          allowed: true,
        });
      if (!uuid(p.deviceId) || !uuid(p.requestId))
        throw new ApiError("invalid_request");
      if (p.action === "cancel") {
        await db.cancel(user.id, p.deviceId, p.requestId);
        return json({ ok: true });
      }
      if (!options.key) throw new ApiError("server_config", 503);
      let job: Job;
      if (p.action === "start") {
        job = await db.reserve(
          user.id,
          p.deviceId,
          p.requestId,
          prepareContext(p),
        );
      } else if (p.action === "resume") {
        const previous = await db.get(user.id, p.deviceId, p.requestId);
        if (p.round !== previous.round || previous.status !== "waiting")
          throw new ApiError("invalid_job", 409);
        const results = validateResults(previous.pending, p.results);
        job = await db.reserve(
          user.id,
          p.deviceId,
          p.requestId,
          { contents: appendResults(previous, results) },
          p.round,
        );
      } else throw new ApiError("invalid_request");

      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        request.signal,
        AbortSignal.timeout(85000),
      ]);
      const encoder = new TextEncoder();
      let disconnected = false;
      const stream = new ReadableStream<Uint8Array>({
        start(sink) {
          const emit = (event: ChatEvent) => {
            if (!disconnected)
              sink.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
          };
          void (async () => {
            try {
              const result = await (options.generate || generateGemini)({
                key: options.key,
                model: options.model,
                job,
                signal,
                emit: (text) => emit({ type: "delta", text }),
              });
              if (signal.aborted)
                throw new DOMException("Aborted", "AbortError");
              const contents = [
                ...job.contents,
                { role: "model", parts: result.parts },
              ];
              const saved = await db.finish(
                job,
                result.calls.length ? "waiting" : "complete",
                contents,
                result.calls,
                result,
              );
              if (!saved) throw new ApiError("invalid_job", 409);
              if (result.calls.length)
                emit({
                  type: "tools",
                  jobId: job.id,
                  round: job.round,
                  calls: result.calls,
                });
              else emit({ type: "done" });
            } catch (e) {
              await db
                .finish(job, signal.aborted ? "cancelled" : "error")
                .catch(() => {});
              emit({
                type: "error",
                code: signal.aborted
                  ? "interrupted"
                  : e instanceof ApiError
                    ? e.code
                    : "server_error",
              });
            } finally {
              if (!disconnected) {
                disconnected = true;
                sink.close();
              }
            }
          })();
        },
        cancel() {
          disconnected = true;
          controller.abort();
          void db.cancel(user.id, p.deviceId, p.requestId).catch(() => {});
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (e) {
      // Never return provider bodies, tokens, SQL details or stack traces.
      return json(
        { code: e instanceof ApiError ? e.code : "server_error" },
        e instanceof ApiError ? e.status : 500,
      );
    }
  };
}
