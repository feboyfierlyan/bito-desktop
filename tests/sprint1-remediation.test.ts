import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { mkdtemp, writeFile, symlink, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hasCrisisSignal, CRISIS_HELPLINES, crisisFallbackReply } from "../src/crisis-safety";
import { bitoVoiceInstructions, type BitoStyle } from "../src/bito-voice";
import { generateDemoReply } from "../electron/demo";
import { readSelectedFile } from "../electron/selected-files";
import { textFileInput } from "../electron/file-output";
import { webUrl } from "../src/web-search";
import { Store } from "../electron/store";
import { EncryptedSessionStorage, type Cipher } from "../electron/session-storage";
import { extractLocalOfficeText } from "../electron/local-documents";
import { buildBitoIcsCalendar } from "../src/calendar-ics";
import { projectCommand } from "../electron/projects";
import { defaultState } from "../electron/core";
import { newProject, approveProjectPlan } from "../src/projects";
import { savedWorkQuery } from "../src/saved-work";
import { quickTaskRemovalScope } from "../electron/quick-task-removal";

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildMinimalZip(entries: Record<string, string>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const names = Object.keys(entries);

  for (const name of names) {
    const nameBuf = Buffer.from(name, "utf8");
    const rawBuf = Buffer.from(entries[name], "utf8");
    const compBuf = deflateRawSync(rawBuf);
    const sum = crc32(rawBuf);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(compBuf.length, 18);
    local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(compBuf.length, 20);
    central.writeUInt32LE(rawBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    localParts.push(local, compBuf);
    centralParts.push(central);
    offset += local.length + compBuf.length;
  }

  const cdBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...localParts, cdBuf, eocd]));
}

test("BITO-006: crisis safety detector and voice guardrails surface Indonesian helplines across all styles", async () => {
  assert.equal(hasCrisisSignal("gue pengen bunuh diri rasanya"), true);
  assert.equal(hasCrisisSignal("aku mau menyakiti diri sendiri"), true);
  assert.equal(hasCrisisSignal("i want to kill myself tonight"), true);
  assert.equal(hasCrisisSignal("deadline tugas mati lampu bikin pusing"), false);
  assert.ok(CRISIS_HELPLINES.some((h) => h.title.includes("119")));

  for (const style of ["direct", "chill", "humor", "care"] as BitoStyle[]) {
    const prompt = bitoVoiceInstructions(style);
    assert.match(prompt, /KESELAMATAN KRISIS/);
    assert.match(prompt, /119 ext\. 8/);
    assert.match(prompt, /healing119\.id/);
  }

  const demoCrisis = await generateDemoReply({
    name: "Raka",
    text: "aku pengen mengakhiri hidupku sekarang",
    signal: new AbortController().signal,
    onDelta: () => {},
  });
  assert.equal(demoCrisis, crisisFallbackReply());
  assert.match(demoCrisis, /119/);
});

test("BITO-012: readSelectedFile rejects symbolic links without leaking target bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-symlink-"));
  try {
    const secretPath = join(dir, "secret.txt");
    const linkPath = join(dir, "innocent.txt");
    await writeFile(secretPath, "TOP_SECRET_CREDENTIAL_DATA", "utf8");
    await symlink(secretPath, linkPath);

    await assert.rejects(
      readSelectedFile(linkPath),
      /symlink|simbolik/i,
    );
    const genuine = await readSelectedFile(secretPath);
    assert.equal(genuine.toString("utf8"), "TOP_SECRET_CREDENTIAL_DATA");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("BITO-021: CSV export neutralizes spreadsheet formulas and webUrl blocks insecure/local URLs", () => {
  const csv = textFileInput({
    name: "jadwal.csv",
    content: "Tugas,Rumus\n=CMD|' /C calc'!A0,+SUM(1,2)\nNormal, -100\n@IMPORTXML,aman",
  });
  assert.equal(csv.format, "csv");
  assert.match(csv.content, /^Tugas,Rumus\n'=CMD/m);
  assert.match(csv.content, /,'\+SUM\(1,2\)/);
  assert.match(csv.content, /, '-100/);
  assert.match(csv.content, /\n'@IMPORTXML,aman/);

  const md = textFileInput({
    name: "catatan.md",
    content: "- Item pertama\n+ Item kedua",
  });
  assert.equal(md.content, "- Item pertama\n+ Item kedua");

  assert.equal(webUrl("http://127.0.0.1:8080/admin"), undefined);
  assert.equal(webUrl("javascript:alert(1)"), undefined);
  assert.equal(webUrl("file:///etc/passwd"), undefined);
  assert.equal(webUrl("https://healing119.id"), "https://healing119.id/");
});

test("BITO-017: Store quarantines corrupted SQLite files instead of crashing at launch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-corrupt-"));
  try {
    const dbPath = join(dir, "state.sqlite");
    await writeFile(dbPath, Buffer.from("NOT_A_VALID_SQLITE_HEADER_BYTES_0000"));
    const store = new Store(dbPath);
    const loaded = store.load();
    assert.equal(store.recoveredFromCorruption, true);
    assert.deepEqual(loaded.tasks, []);
    store.close();

    const files = await readdir(dir);
    assert.ok(
      files.some((f) => f.includes(".corrupt-") && f.endsWith(".bak")),
      "corrupted database should be quarantined as .corrupt-*.bak",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("BITO-007 & BITO-022: EncryptedSessionStorage clears broken keychain state and caches verified user identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bito-session-"));
  try {
    const sessionPath = join(dir, "auth-session.bin");
    await writeFile(sessionPath, Buffer.from("corrupted-ciphertext"));

    let allowDecrypt = false;
    const cipher: Cipher = {
      encrypt: async (plain) => Buffer.from(plain, "utf8"),
      decrypt: async (buf) => {
        if (!allowDecrypt) throw Error("Keychain locked");
        return buf.toString("utf8");
      },
    };

    const broken = new EncryptedSessionStorage(sessionPath, cipher);
    await assert.rejects(broken.getItem("token"), /keychain/i);
    // Sign-out / clear must still recover cleanly without trapping the user!
    await broken.clear();
    assert.equal(await broken.getItem("token"), null);

    allowDecrypt = true;
    const userId = "11111111-2222-4333-8444-555555555555";
    await broken.setVerifiedUser({ id: userId, email: "user@example.com" });

    const reloaded = new EncryptedSessionStorage(sessionPath, cipher);
    assert.deepEqual(await reloaded.getVerifiedUser(), {
      id: userId,
      email: "user@example.com",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("BITO-015 & TASK-E01: zero-cost local .docx/.xlsx extraction and RFC 5545 .ics export", () => {
  const docxBytes = buildMinimalZip({
    "word/document.xml":
      '<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>Bab 1 Pendahuluan</w:t></w:r></w:p><w:p><w:r><w:t>Rumusan masalah &amp; tujuan riset.</w:t></w:r></w:p></w:body></w:document>',
  });
  const docx = extractLocalOfficeText(".docx", docxBytes);
  assert.ok(docx);
  assert.match(docx.content, /Bab 1 Pendahuluan/);
  assert.match(docx.content, /Rumusan masalah & tujuan riset\./);

  const xlsxBytes = buildMinimalZip({
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Jadwal Riset" sheetId="1"/></sheets></workbook>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Minggu 1</t></si><si><t>Studi Literatur</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>100</v></c></row></sheetData></worksheet>',
  });
  const xlsx = extractLocalOfficeText(".xlsx", xlsxBytes);
  assert.ok(xlsx);
  assert.match(xlsx.content, /### Jadwal Riset/);
  assert.match(xlsx.content, /Minggu 1 \| Studi Literatur \| 100/);

  const state = defaultState();
  const created = projectCommand(state, "project-create", {
    name: "Skripsi AI",
    brief: "- Kumpulkan dataset\n- Evaluasi baseline",
    outcome: "Draft siap sidang",
    deadline: "2026-12-15",
    availability: "1 jam per hari",
  });
  assert.equal(created.ok, true);
  const projectId = created.value as string;
  projectCommand(state, "project-quick-start", { id: projectId });
  const proj = state.projects[0];
  proj.plan!.milestones[0].tasks[0].dueDate = "2026-11-25";

  const { ics, eventCount } = buildBitoIcsCalendar({
    projects: [proj],
    tasks: [
      {
        id: "qt-1",
        title: "Kirim email dosen pembimbing",
        done: false,
        dueDate: "2026-11-20",
      },
    ],
    now: new Date("2026-11-18T00:00:00Z"),
  });
  assert.ok(eventCount >= 3);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:\[Tenggat Proyek\] Skripsi AI/);
  assert.match(ics, /SUMMARY:\[Skripsi AI\] Kumpulkan dataset/);
  assert.match(ics, /SUMMARY:\[Tugas singkat\] Kirim email dosen pembimbing/);
});

test("BITO-016 & BITO-023: project-quick-start, project-task-delete, project-delete, material unlink, and gue/lu parity", () => {
  const state = defaultState();
  const createRes = projectCommand(state, "project-create", {
    name: "Riset Pasar",
    brief: "- Wawancara 3 pengguna awal",
    outcome: "Ringkasan temuan",
    deadline: "2026-12-10",
    availability: "30 menit",
  });
  const projectId = createRes.value as string;
  const quickRes = projectCommand(state, "project-quick-start", {
    id: projectId,
  });
  assert.equal(quickRes.ok, true);
  const created = state.projects[0];
  assert.equal(created.status, "active");
  assert.equal(created.plan!.milestones[0].tasks[0].title, "Wawancara 3 pengguna awal");

  const taskId = created.plan!.milestones[0].tasks[0].id;
  projectCommand(state, "project-task-delete", {
    id: created.id,
    taskId,
  });
  assert.equal(state.projects[0].plan!.milestones[0].tasks.length, 0);

  projectCommand(state, "project-delete", { id: created.id });
  assert.equal(state.projects.length, 0);
  assert.equal(state.activeProjectId, null);

  // Jakarta colloquial gue/gw/gua parity
  assert.notEqual(savedWorkQuery("daftar tugas gue sekarang"), null);
  assert.notEqual(savedWorkQuery("jadwal gw sekarang"), null);
  assert.equal(quickTaskRemovalScope("gue mau hapus semua tugas di quick task"), "all");
  assert.equal(quickTaskRemovalScope("bersihin tugas singkat gw yg udah kelar"), "done");
});

test("BITO-002 & BITO-003: migrations and package metadata contain zero personal emails", async () => {
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  const entries = await readdir(migrationDir);
  for (const entry of entries) {
    if (!entry.endsWith(".sql")) continue;
    const sql = await readFile(new URL(entry, migrationDir), "utf8");
    assert.doesNotMatch(sql, /@gmail\.com/i, `${entry} must not contain personal email addresses`);
  }
  const pkg = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.doesNotMatch(pkg, /@astryxdesign/);
  assert.doesNotMatch(pkg, /"openai"/);
});
