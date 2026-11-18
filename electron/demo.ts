import { setTimeout as delay } from "node:timers/promises";
import { crisisFallbackReply, hasCrisisSignal } from "../src/crisis-safety";

/** Local revision preview; never calls a model or executes tools. */
export async function generateDemoReply({
  name,
  text = "",
  signal,
  onDelta,
  multiBubble = false,
}: {
  name: string;
  multiBubble?: boolean;
  text?: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}) {
  const response = hasCrisisSignal(text)
    ? crisisFallbackReply()
    : multiBubble
      ? "Eh, aku kepikiran sesuatu 😄[[BITO_BUBBLE]]Sekarang aku bisa balas beberapa bubble, kayak gini.[[BITO_BUBBLE]]Tetap satu obrolan, cuma ritmenya lebih santai."
      : /panjang|detail|rinci|long/i.test(text)
        ? `Oke, ini contoh balasan panjang buat nyobain tampilan chat. Isinya sengaja beberapa paragraf supaya kamu bisa lihat bubble-nya menyesuaikan dan area chat tumbuh ke atas.\n\nCoba scroll ke pesan sebelumnya selagi teks ini masih muncul. Posisi bacamu seharusnya tetap di situ, jadi kamu bisa baca dulu tanpa ketarik ke pesan terbaru.\n\nKamu juga bisa geser pegangan di sudut chat buat mengubah ukurannya. Teksnya ikut menyesuaikan lebar bubble, sementara input tetap bisa dipakai dengan nyaman.\n\n(Mode preview lokal: contoh tampilan, belum memanggil AI cloud.)`
        : `Hai, ${name.trim() || "teman"}! Mau cerita atau nyicil satu langkah kecil? (Pratinjau lokal)`;
  await delay(300, undefined, { signal });
  for (const chunk of response.match(/\S+\s*/g) || []) {
    await delay(35, undefined, { signal });
    onDelta(chunk);
  }
  return response;
}
