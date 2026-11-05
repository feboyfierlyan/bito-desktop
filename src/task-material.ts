/** Portable contract shared by desktop and the authenticated analysis endpoint. */
export const MAX_TASK_FILE_BYTES = 6 * 1024 * 1024;
export type MaterialAnalysis = {
  content: string;
  warnings: string[];
  kind: "pdf" | "image";
};
export function parseMaterialAnalysis(value: unknown): MaterialAnalysis {
  const p = value as MaterialAnalysis;
  if (
    !p ||
    typeof p.content !== "string" ||
    !p.content.trim() ||
    p.content.length > 18000 ||
    !["pdf", "image"].includes(p.kind) ||
    !Array.isArray(p.warnings) ||
    p.warnings.length > 8 ||
    p.warnings.some((w) => typeof w !== "string" || w.length > 300)
  )
    throw Error(
      "Hasil pembacaan bahan belum valid. Coba file yang lebih jelas atau bagian yang lebih pendek.",
    );
  return { content: p.content.trim(), warnings: p.warnings, kind: p.kind };
}
export function taskFileMime(
  bytes: Uint8Array,
): "application/pdf" | "image/png" | "image/jpeg" | "image/webp" {
  if (!bytes.length || bytes.length > MAX_TASK_FILE_BYTES)
    throw Error("Pilih PDF atau gambar maksimal 6 MB.");
  const starts = (a: number[]) => a.every((v, i) => bytes[i] === v);
  if (starts([37, 80, 68, 70, 45])) return "application/pdf";
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (starts([255, 216, 255])) return "image/jpeg";
  if (
    starts([82, 73, 70, 70]) &&
    [87, 69, 66, 80].every((v, i) => bytes[8 + i] === v)
  )
    return "image/webp";
  throw Error(
    "Format belum didukung. Gunakan PDF, PNG, JPG, WebP, atau file teks.",
  );
}
