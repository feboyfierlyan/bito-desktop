import { inflateRawSync } from "node:zlib";

const MAX_ARCHIVE_BYTES = 6 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED = 4 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 8 * 1024 * 1024;
const MAX_ENTRIES = 128;

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Minimal bounded ZIP reader using Central Directory for OOXML (.docx / .xlsx) files. */
function readZipXmlEntries(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
): Map<string, string> {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES)
    throw Error("Ukuran dokumen Office melebihi batas aman 6 MB.");
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.readUInt32LE(0) !== 0x04034b50)
    throw Error("File Office rusak atau terenkripsi sandi.");

  // Locate End of Central Directory (EOCD)
  let eocd = -1;
  const minSearch = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minSearch; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw Error("Struktur arsip dokumen tidak valid.");

  const totalEntries = buf.readUInt16LE(eocd + 10);
  if (totalEntries > MAX_ENTRIES * 4)
    throw Error("Dokumen memiliki terlalu banyak komponen internal.");
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize > buf.length)
    throw Error("Indeks dokumen Office tidak lengkap.");

  const out = new Map<string, string>();
  let pos = cdOffset;
  let totalUncompressed = 0;
  let matchedCount = 0;

  for (let i = 0; i < totalEntries && pos + 46 <= cdOffset + cdSize; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;

    if (!wanted(name)) continue;
    if (flags & 0x01)
      throw Error("Dokumen terkunci kata sandi. Buka kuncinya terlebih dahulu.");
    if (++matchedCount > MAX_ENTRIES) break;
    if (
      uncompSize > MAX_ENTRY_UNCOMPRESSED ||
      totalUncompressed + uncompSize > MAX_TOTAL_UNCOMPRESSED
    )
      throw Error("Isi dokumen terlalu besar setelah diekstrak.");
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50)
      throw Error("Bagian dokumen rusak.");

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length)
      throw Error("Bagian data dokumen terpotong.");

    const slice = buf.subarray(dataStart, dataStart + compSize);
    let raw: Buffer;
    if (method === 0) {
      raw = slice;
    } else if (method === 8) {
      raw = inflateRawSync(slice, { maxOutputLength: MAX_ENTRY_UNCOMPRESSED });
    } else {
      throw Error("Metode kompresi dokumen ini belum didukung.");
    }
    totalUncompressed += raw.length;
    out.set(name, raw.toString("utf8"));
  }
  return out;
}

export function isLocalOfficeExtension(ext: string): ext is ".docx" | ".xlsx" {
  const lower = ext.toLowerCase();
  return lower === ".docx" || lower === ".xlsx";
}

export function extractLocalOfficeText(
  ext: ".docx" | ".xlsx",
  bytes: Uint8Array,
  charLimit = 48000,
): { content: string; warnings: string[] } {
  const warnings: string[] = [];
  if (ext === ".docx") {
    const entries = readZipXmlEntries(
      bytes,
      (name) =>
        name === "word/document.xml" ||
        /^word\/(?:header|footer)\d*\.xml$/.test(name),
    );
    const doc = entries.get("word/document.xml");
    if (!doc)
      throw Error("File ini bukan dokumen Word (.docx) standar.");
    const paragraphs = doc
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
      .split(/<\/w:p>|<\/w:tr>/)
      .map((block) => {
        const runs: string[] = [];
        const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(block))) runs.push(decodeXmlEntities(match[1]));
        return runs.join("").replace(/[ \t]+/g, " ").trim();
      })
      .filter(Boolean);
    const full = paragraphs.join("\n");
    if (!full.trim())
      throw Error("Dokumen .docx ini tidak berisi teks yang dapat dibaca.");
    if (full.length > charLimit)
      warnings.push(
        `Hanya ${charLimit.toLocaleString("id-ID")} karakter awal yang disertakan.`,
      );
    return { content: full.slice(0, charLimit), warnings };
  }

  // .xlsx extraction
  const entries = readZipXmlEntries(
    bytes,
    (name) =>
      name === "xl/sharedStrings.xml" ||
      name === "xl/workbook.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );
  const sharedStrings: string[] = [];
  const sst = entries.get("xl/sharedStrings.xml");
  if (sst) {
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRe.exec(sst))) {
      const parts: string[] = [];
      const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRe.exec(siMatch[1])))
        parts.push(decodeXmlEntities(tMatch[1]));
      sharedStrings.push(parts.join(""));
    }
  }
  const sheetNames: string[] = [];
  const wb = entries.get("xl/workbook.xml");
  if (wb) {
    const shRe = /<sheet\b[^>]*\bname="([^"]+)"/g;
    let shMatch: RegExpExecArray | null;
    while ((shMatch = shRe.exec(wb)))
      sheetNames.push(decodeXmlEntities(shMatch[1]));
  }

  const sheetKeys = [...entries.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!sheetKeys.length)
    throw Error("File ini bukan spreadsheet Excel (.xlsx) standar.");

  const sections: string[] = [];
  sheetKeys.forEach((key, idx) => {
    const xml = entries.get(key)!;
    const rows: string[] = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(xml))) {
      const cells: string[] = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || "";
        let val = "";
        if (type === "inlineStr") {
          const tMatch = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body);
          val = tMatch ? decodeXmlEntities(tMatch[1]) : "";
        } else {
          const vMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
          if (vMatch) {
            const rawVal = decodeXmlEntities(vMatch[1]);
            val =
              type === "s"
                ? sharedStrings[Number.parseInt(rawVal, 10)] ?? rawVal
                : rawVal;
          }
        }
        cells.push(val.replace(/\s+/g, " ").trim());
      }
      if (cells.some(Boolean)) rows.push(cells.join(" | "));
    }
    if (rows.length) {
      const label = sheetNames[idx] || `Sheet ${idx + 1}`;
      sections.push(`### ${label}\n${rows.join("\n")}`);
    }
  });

  const full = sections.join("\n\n");
  if (!full.trim())
    throw Error("Spreadsheet .xlsx ini masih kosong atau hanya berisi grafik.");
  if (full.length > charLimit)
    warnings.push(
      `Hanya ${charLimit.toLocaleString("id-ID")} karakter awal yang disertakan.`,
    );
  return { content: full.slice(0, charLimit), warnings };
}
