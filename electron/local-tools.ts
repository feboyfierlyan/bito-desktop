import { join } from "node:path";
import { mkdir, realpath } from "node:fs/promises";
export function folderName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 100 ||
    value !== value.trim() ||
    /[\x00-\x1f<>:"/\\|?*]/.test(value) ||
    /[. ]$/.test(value) ||
    /^(\.{1,2}|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
  )
    throw Error(
      "Nama folder belum valid. Gunakan satu nama tanpa garis miring atau karakter khusus.",
    );
  return value;
}
export async function createChosenFolder(
  name: unknown,
  chooseParent: (name: string) => Promise<string | null>,
  signal: AbortSignal,
) {
  const safe = folderName(name);
  signal.throwIfAborted();
  const chosen = await chooseParent(safe);
  signal.throwIfAborted();
  if (!chosen)
    return {
      ok: false,
      result: "Pengguna membatalkan pemilihan lokasi. Tidak ada folder dibuat.",
    };
  const parent = await realpath(chosen);
  const path = join(parent, safe);
  try {
    await mkdir(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      return {
        ok: false,
        result:
          "Nama tersebut sudah ada di lokasi pilihan. Tidak ditimpa atau diubah.",
      };
    throw Error("Folder belum bisa dibuat di lokasi pilihan.");
  }
  return {
    ok: true,
    result: `Folder “${safe}” berhasil dibuat di lokasi pilihan pengguna.`,
  };
}
