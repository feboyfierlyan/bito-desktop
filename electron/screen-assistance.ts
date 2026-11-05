import { z } from "zod";
import type {
  ToolCall,
  ToolResult,
} from "../supabase/functions/_shared/protocol";
export type ScreenObservation = {
  status: "found" | "ambiguous" | "not_found" | "unavailable";
  answer: string;
  label: string;
  highlighted: boolean;
  guiding?: boolean;
  handled?: boolean;
};
/** Only stable error codes cross into user copy; never raw provider bodies. */
export function screenFailureText(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const messages: Record<string, string> = {
    invalid_grounding:
      "Balasan pembacaan layarnya belum valid, jadi aku belum menyorot apa pun. Klik aku untuk mencoba lagi, ya.",
    incomplete_response:
      "Pembacaan layarnya terputus sebelum selesai. Klik aku untuk mencoba lagi, ya.",
    provider_error:
      "Layanan pembaca layar sedang bermasalah. Klik aku untuk mencoba lagi sebentar, ya.",
    provider_limit:
      "Layanan pembaca layar sedang mencapai batas pemakaian. Coba lagi sebentar, ya.",
    busy: "Pembacaan sebelumnya masih diproses. Tunggu sebentar, ya.",
    access_denied:
      "Akunmu belum mendapat akses bantuan Bito. Hubungi pemilik demo, ya.",
    sign_in_required: "Sesi masukmu berakhir. Masuk lagi ke Bito, ya.",
    screen_unavailable:
      "Layanan bantuan layar belum tersedia. Coba lagi sebentar, ya.",
  };
  if (typeof code === "string" && messages[code]) return messages[code];
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return "Pembacaan layarnya belum selesai tepat waktu. Klik aku untuk mencoba lagi, ya.";
  return "Pembacaan layarnya belum berhasil. Klik aku kalau mau coba lagi, ya.";
}
/** Per-turn read-only tool. Observation runs on demand, not on every chat, and
 * bypasses persisted action receipts so a future turn cannot reuse old pixels. */
export function screenAssistanceExecutor(options: {
  inspect: (
    question: string,
    signal: AbortSignal,
    call: ToolCall,
    round: number,
  ) => Promise<ScreenObservation>;
  other: (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
}) {
  let observation: ScreenObservation | undefined;
  let used = false;
  let observedQuestion = "";
  return async (
    call: ToolCall,
    signal: AbortSignal,
    context: { round: number },
  ): Promise<ToolResult> => {
    signal.throwIfAborted();
    if (call.name !== "inspect_screen") return options.other(call, signal);
    const parsed = z
      .object({ question: z.string().trim().min(1).max(4000) })
      .strict()
      .safeParse(call.args);
    if (!parsed.success)
      return {
        id: call.id,
        ok: false,
        result: "Permintaan bantuan layar belum valid.",
      };
    // Return the same observation if the model repeats its call. No recapture,
    // extra model bill or second jump of the companion within the same turn.
    if (!used) {
      used = true;
      observedQuestion = parsed.data.question;
      observation = await options.inspect(
        parsed.data.question,
        signal,
        call,
        context.round,
      );
      signal.throwIfAborted();
    }
    if (observedQuestion !== parsed.data.question)
      return {
        id: call.id,
        ok: false,
        result:
          "Layar sudah diperiksa untuk tujuan sebelumnya dalam pesan ini. Jangan memakai sorotan itu untuk target baru. Tunggu pertanyaan berikutnya untuk membaca tampilan terbaru.",
      };
    if (!observation)
      return {
        id: call.id,
        ok: false,
        result: "Pembacaan layar tidak selesai. Jangan menebak posisi.",
      };
    const bounded = {
      ...observation,
      answer: observation.answer.slice(0, 900),
      label: observation.label.slice(0, 120),
    };
    while (JSON.stringify(bounded).length > 2000)
      bounded.answer = bounded.answer.slice(
        0,
        Math.floor(bounded.answer.length / 2),
      );
    return {
      id: call.id,
      ok: observation.status !== "unavailable",
      result: JSON.stringify(bounded),
    };
  };
}
