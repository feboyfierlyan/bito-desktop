import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { z } from "zod";

// Strict parsing prevents the generic renderer command from supplying a path.
export const parseFilePickerRequest = (value: unknown) =>
  z.object({ slots: z.number().int().min(1).max(3).default(3) }).strict().parse(value ?? {});

/** Bound reads on the opened descriptor, including files growing after stat. */
export async function readSelectedFile(path: string, limit = 6 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw Error("Pilih dokumen biasa, bukan perangkat atau folder.");
    if (info.size > limit) throw Error("File terlalu besar.");
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (!bytesRead) return Buffer.concat(chunks, size);
      size += bytesRead;
      if (size > limit) throw Error("File terlalu besar.");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    throw Error("File terlalu besar.");
  } finally { await file.close(); }
}
