import { open, realpath, lstat, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join } from "node:path";
import { z } from "zod";
import { folderName } from "./local-tools";

export type FileOutput = {
  id: string;
  path: string;
  name: string;
  format: "txt" | "md" | "csv";
  bytes: number;
  device: string;
  inode: string;
};
export const maxFileBytes = 64000;
export function textFileInput(raw: unknown) {
  const p = z
    .object({ name: z.string(), content: z.string().max(48000) })
    .strict()
    .parse(raw);
  const name = folderName(p.name);
  const format = extname(name).slice(1).toLowerCase();
  if (!["txt", "md", "csv"].includes(format))
    throw Error("Pilih format TXT, Markdown (.md), atau CSV.");
  if (
    p.content.includes("\0") ||
    Buffer.byteLength(p.content, "utf8") > maxFileBytes
  )
    throw Error("Isi file harus berupa teks UTF-8, maksimal 64 KB.");
  return { name, content: p.content, format: format as FileOutput["format"] };
}

export async function writeChosenTextFile(
  id: string,
  raw: unknown,
  chooseParent: (name: string) => Promise<string | null>,
  signal: AbortSignal,
): Promise<FileOutput | null> {
  const input = textFileInput(raw);
  signal.throwIfAborted();
  const chosen = await chooseParent(input.name);
  signal.throwIfAborted();
  if (!chosen) return null;
  const parent = await realpath(chosen),
    path = join(parent, input.name);
  // Exclusive creation rejects existing files and symbolic links, on every OS.
  let file;
  try {
    file = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw Error(
        "File dengan nama ini sudah ada. Tidak ditimpa; pilih nama lain.",
      );
    throw Error("File belum bisa disimpan di folder pilihan.");
  }
  const identity = await file.stat({ bigint: true });
  try {
    await file.writeFile(input.content, "utf8");
    await file.sync();
  } catch {
    // Remove only our own incomplete new file, never an existing/replaced file.
    // Close first so Windows permits removing the file as well.
    await file.close();
    const actual = await lstat(path, { bigint: true }).catch(() => null);
    if (actual?.ino === identity.ino && actual?.dev === identity.dev)
      await unlink(path).catch(() => {});
    throw Error("Penulisan file belum selesai. Coba simpan kembali.");
  } finally {
    // FileHandle.close() is idempotent, including the failure cleanup above.
    await file.close();
  }
  return {
    id,
    path,
    name: input.name,
    format: input.format,
    bytes: Buffer.byteLength(input.content, "utf8"),
    device: String(identity.dev),
    inode: String(identity.ino),
  };
}

export async function readOutputFile(output: FileOutput) {
  const actual = await lstat(output.path, { bigint: true }).catch(() => null);
  if (
    !actual?.isFile() ||
    actual.isSymbolicLink() ||
    String(actual.dev) !== output.device ||
    String(actual.ino) !== output.inode
  )
    throw Error(
      "File sudah dipindahkan, dihapus, atau diganti. Hasil lama tidak dapat dibuka.",
    );
  if ((await realpath(output.path)) !== output.path)
    throw Error("Lokasi file sudah berubah.");
  const file = await open(
    output.path,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = await file.stat({ bigint: true });
    if (
      !stat.isFile() ||
      String(stat.dev) !== output.device ||
      String(stat.ino) !== output.inode ||
      stat.size > BigInt(maxFileBytes)
    )
      throw Error("File berubah atau terlalu besar untuk pratinjau.");
    const data = Buffer.alloc(maxFileBytes + 1);
    const { bytesRead } = await file.read(data, 0, data.length, 0);
    if (bytesRead > maxFileBytes)
      throw Error("File terlalu besar untuk pratinjau.");
    return data.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}
