import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultState } from "../electron/core";
import { applyProjectTool, projectCommand } from "../electron/projects";
import { activeProject, projectModelContext } from "../src/projects";
import {
  importProjectMaterial,
  importNewProjectMaterial,
} from "../electron/project-import";
import { newTaskBrief, visibleBlocker } from "../src/project-presentation";
import { MAX_TASK_FILE_BYTES, taskFileMime } from "../src/task-material";
import {
  analyzeMaterial,
  prepareMaterial,
} from "../supabase/functions/_shared/material-analysis";
import {
  createHandler,
  type Repository,
} from "../supabase/functions/_shared/handler";
import type { Job } from "../supabase/functions/_shared/protocol";
const brief = {
  name: "Presentasi ekosistem",
  brief: "Presentasi kelompok",
  outcome: "8 slide",
  deadline: null,
  availability: "30 menit per hari",
};
const review = {
  summary: "Buat presentasi ekosistem",
  deliverables: ["8 slide"],
  requirements: ["Cantumkan sumber"],
  unknowns: ["Tenggat belum ditentukan"],
  sourceIds: [],
};
function setup() {
  const s = defaultState();
  projectCommand(s, "project-create", brief);
  return { s, p: activeProject(s)! };
}
test("understanding is editable, requires current UI confirmation, and becomes stale on new evidence", () => {
  const { s, p } = setup();
  applyProjectTool(
    s,
    { id: randomUUID(), name: "review_project_task", args: review },
    p.id,
  );
  const v = p.version,
    u = p.understanding!;
  assert.equal(u.confirmedAt, null);
  projectCommand(s, "project-understanding-confirm", {
    id: p.id,
    version: v,
    understandingId: u.id,
    understanding: {
      ...review,
      deliverables: ["10 slide, sesuai koreksi pengguna"],
    },
  });
  assert.ok(p.understanding!.confirmedAt);
  assert.equal(
    p.understanding!.deliverables[0],
    "10 slide, sesuai koreksi pengguna",
  );
  projectCommand(s, "project-brief", {
    id: p.id,
    brief: {
      ...brief,
      deadline: "2026-11-10",
      availability: "20 menit per sore",
    },
  });
  assert.ok(
    p.understanding!.confirmedAt,
    "answering scheduling questions must not restart task review",
  );
  assert.throws(
    () =>
      projectCommand(s, "project-understanding-confirm", {
        id: p.id,
        version: v,
        understandingId: u.id,
        understanding: review,
      }),
    /berubah/,
  );
  projectCommand(s, "project-material-add", {
    id: p.id,
    material: { name: "instruksi", content: "Revisi: 12 slide" },
  });
  assert.equal(p.understanding!.confirmedAt, null);
  assert.match(projectModelContext(s), /Revisi: 12 slide/);
  const old = p.understanding!.id;
  assert.throws(
    () =>
      applyProjectTool(
        s,
        {
          id: randomUUID(),
          name: "review_project_task",
          args: { ...review, sourceIds: [randomUUID()] },
        },
        p.id,
      ),
    /rujukan/,
  );
  assert.equal(p.understanding!.id, old);
});
test("import analyzes a PDF once, stores an explicit extract without binary data, and deduplicates per task", async () => {
  const { s, p } = setup();
  let calls = 0;
  const input = {
    state: s,
    projectId: p.id,
    pick: async () => "/tmp/instruksi.pdf",
    read: async () => Buffer.from("%PDF-1.7\nfixture"),
    analyze: async () => {
      calls++;
      return {
        kind: "pdf" as const,
        content: "[Halaman 1] Buat 8 slide.",
        warnings: ["Rubrik di halaman 2 kurang terbaca."],
      };
    },
    signal: new AbortController().signal,
    isCurrent: () => true,
  };
  assert.deepEqual(await importProjectMaterial(input), { added: true });
  assert.equal(p.materials[0].kind, "pdf");
  assert.equal(p.materials[0].warnings?.length, 1);
  assert.doesNotMatch(JSON.stringify(s), /JVBER|base64|\/tmp\/instruksi/);
  assert.deepEqual(await importProjectMaterial(input), { duplicate: true });
  assert.equal(calls, 1);
  projectCommand(s, "project-create", { ...brief, name: "Tugas B" });
  assert.equal(activeProject(s)!.materials.length, 0);
});
test("late, cancelled and failed reads never mutate task state", async () => {
  const { s, p } = setup();
  const controller = new AbortController();
  const input = {
    state: s,
    projectId: p.id,
    pick: async () => "/tmp/photo.png",
    read: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    analyze: async () => {
      projectCommand(s, "project-create", { ...brief, name: "B" });
      return { kind: "image" as const, content: "Tugas A", warnings: [] };
    },
    signal: controller.signal,
    isCurrent: () => true,
  };
  await assert.rejects(importProjectMaterial(input), /Tugas berubah/);
  assert.equal(p.materials.length, 0);
  assert.equal(activeProject(s)!.materials.length, 0);
  projectCommand(s, "project-select", p.id);
  await assert.rejects(
    importProjectMaterial({
      ...input,
      analyze: async () => {
        controller.abort();
        return { kind: "image", content: "Batal", warnings: [] };
      },
    }),
  );
  assert.equal(p.materials.length, 0);
  await assert.rejects(
    importProjectMaterial({
      ...input,
      signal: new AbortController().signal,
      analyze: async () => {
        throw Error("provider unavailable");
      },
    }),
    /provider unavailable/,
  );
  assert.equal(p.materials.length, 0);
});
test("text import stays local and identifies clipping; unsupported/oversized bytes do not reach the model", async () => {
  const { s, p } = setup();
  let calls = 0;
  const base = {
    state: s,
    projectId: p.id,
    pick: async () => "/tmp/bahan.md",
    read: async () => Buffer.from("a".repeat(50000)),
    analyze: async () => {
      calls++;
      throw Error();
    },
    signal: new AbortController().signal,
    isCurrent: () => true,
  };
  await importProjectMaterial(base);
  assert.equal(calls, 0);
  assert.equal(p.materials[0].content.length, 48000);
  assert.ok(p.materials[0].warnings?.length);
  await assert.rejects(
    importProjectMaterial({
      ...base,
      pick: async () => "/tmp/fake.pdf",
      read: async () => Buffer.from("not a PDF"),
    }),
    /Format/,
  );
  assert.equal(calls, 0);
  assert.throws(
    () => taskFileMime(new Uint8Array(MAX_TASK_FILE_BYTES + 1)),
    /maksimal/,
  );
});
test("provider file reading validates structured output, preserves warnings and suppresses raw provider errors", async () => {
  const input = prepareMaterial({
    name: "tugas.pdf",
    mimeType: "application/pdf",
    data: Buffer.from("%PDF-1.7").toString("base64"),
  });
  let sent: any;
  const o = {
    key: "private-key",
    model: "gemini-3.8-flash",
    input,
    signal: new AbortController().signal,
  };
  const result = await analyzeMaterial({
    ...o,
    fetcher: async (_url, options) => {
      sent = JSON.parse(options!.body as string);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      content: "[Halaman 1] Buat laporan 3 halaman.",
                      warnings: ["Tenggat tidak tercantum."],
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            thoughtsTokenCount: 5,
          },
        }),
      );
    },
  });
  assert.equal(result.output, 25);
  assert.equal(result.result.kind, "pdf");
  assert.equal(
    sent.contents[0].parts[1].inlineData.mimeType,
    "application/pdf",
  );
  assert.match(sent.systemInstruction.parts[0].text, /never guess/i);
  await assert.rejects(
    analyzeMaterial({
      ...o,
      fetcher: async () =>
        new Response("private provider diagnostic", { status: 500 }),
    }),
    /material_read_failed/,
  );
  await assert.rejects(
    analyzeMaterial({
      ...o,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "MAX_TOKENS",
                content: { parts: [{ text: '{"content":"partial"' }] },
              },
            ],
          }),
        ),
    }),
    /material_read_failed/,
  );
  assert.throws(
    () => prepareMaterial({ ...input, mimeType: "image/png" }),
    /invalid_material/,
  );
});
test("material route checks membership, claims/releases a lease, and never persists file payloads", async () => {
  const uid = randomUUID(),
    deviceId = randomUUID(),
    requestId = randomUUID();
  let allowed = false,
    calls = 0,
    saved: any,
    finished: any;
  const repository: Repository = {
    authenticate: async () => ({
      id: uid,
      email: "member@example.test",
      confirmed: true,
    }),
    claim: async () => allowed,
    reserve: async (_u, _d, _i, context) => {
      saved = context;
      return {
        id: requestId,
        user_id: uid,
        device_id: deviceId,
        round: 1,
        status: "running",
        contents: context.contents,
        instructions: context.instructions || "",
        pending: [],
      } as Job;
    },
    get: async () => {
      throw Error();
    },
    finish: async (...args) => {
      finished = args;
      return true;
    },
    cancel: async () => {},
  };
  let fail = false;
  const handle = createHandler({
    repository,
    key: "chat",
    model: "model",
    grounding: { key: "vision", model: "gemini-3.8-flash" },
    materialGenerate: async () => {
      calls++;
      if (fail) throw Error("private diagnostic");
      return {
        result: { content: "8 slide", warnings: [], kind: "pdf" },
        input: 1,
        output: 1,
      };
    },
  });
  const payload = {
    action: "material",
    deviceId,
    requestId,
    name: "PRIVATE_FILENAME.pdf",
    mimeType: "application/pdf",
    data: Buffer.from("%PDF-1.7").toString("base64"),
  };
  const request = () =>
    new Request("https://example.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  assert.equal((await handle(request())).status, 403);
  assert.equal(calls, 0);
  allowed = true;
  const r = await handle(request());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).content, "8 slide");
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE_FILENAME|JVBER/);
  assert.deepEqual(finished.slice(2, 4), [[], []]);
  fail = true;
  const bad = await handle(request());
  assert.equal(bad.status, 500);
  assert.deepEqual(await bad.json(), { code: "server_error" });
  assert.equal(finished[1], "error");
});

test("one-field task intake preserves instructions and optional details without invented dates", () => {
  const intake = newTaskBrief(
    "  Bikin presentasi 5 slide\nGunakan dua jurnal  ",
  );
  assert.equal(intake.name, "Bikin presentasi 5 slide");
  assert.equal(intake.brief, "Bikin presentasi 5 slide\nGunakan dua jurnal");
  assert.equal(intake.deadline, null);
  assert.equal(intake.availability, "");
  assert.equal(newTaskBrief(" ").name, "Tugas baru");
  assert.equal(newTaskBrief("a".repeat(100)).name.length, 70);
  assert.deepEqual(
    newTaskBrief("Baca instruksi", "  Tugas Bahasa  ", "2026-11-06"),
    {
      name: "Tugas Bahasa",
      brief: "Baca instruksi",
      outcome: "",
      deadline: "2026-11-06",
      availability: "",
    },
  );
});

test("empty blocker descriptions are not presented as problems, real blockers remain intact", () => {
  for (const text of [
    undefined,
    null,
    "",
    "Tidak ada",
    "tidak ada hambatan.",
    "Belum ada kendala",
    "none",
    "N/A",
    "-",
  ]) {
    assert.equal(visibleBlocker(text), "", String(text));
  }
  assert.equal(
    visibleBlocker("Belum ada data dari dosen"),
    "Belum ada data dari dosen",
  );
  assert.equal(visibleBlocker("  Belum paham rumus  "), "Belum paham rumus");
});

test("file-first intake commits one task only after analysis and retains the typed brief", async () => {
  const { s, p } = setup();
  const before = structuredClone(p);
  let analyzed = false;
  const options = {
    state: s,
    brief: newTaskBrief("Buat 8 slide", "Presentasi baru", "2026-11-10"),
    pick: async () => "/tmp/instruksi.pdf",
    read: async () => Buffer.from("%PDF-1.7\nfixture"),
    analyze: async () => {
      assert.equal(s.projects.length, 1);
      assert.equal(s.activeProjectId, p.id);
      analyzed = true;
      return {
        kind: "pdf" as const,
        content: "[Halaman 1] Buat 8 slide.",
        warnings: [],
      };
    },
    signal: new AbortController().signal,
    isCurrent: () => true,
  };
  const result = await importNewProjectMaterial(options);
  assert.equal(analyzed, true);
  assert.equal(result.added, true);
  assert.equal(s.projects.length, 2);
  const created = activeProject(s)!;
  assert.equal(created.name, "Presentasi baru");
  assert.equal(created.brief, "Buat 8 slide");
  assert.equal(created.deadline, "2026-11-10");
  assert.equal(created.materials.length, 1);
  assert.equal(created.materials[0].content, "[Halaman 1] Buat 8 slide.");
  assert.equal(created.status, "planning");
  assert.equal(created.plan, null);
  assert.deepEqual(p, before);
  assert.doesNotMatch(JSON.stringify(s), /base64|%PDF|\/tmp\/instruksi/);
});

test("file-first cancellation, failed analysis, account changes and stopped requests leave no empty task", async () => {
  const { s } = setup();
  const before = structuredClone(s);
  const options = {
    state: s,
    pick: async () => "/tmp/instruksi.pdf",
    read: async () => Buffer.from("%PDF-1.7\nfixture"),
    analyze: async () => ({
      kind: "pdf" as const,
      content: "Buat 8 slide",
      warnings: [],
    }),
    signal: new AbortController().signal,
    isCurrent: () => true,
  };
  assert.deepEqual(
    await importNewProjectMaterial({ ...options, pick: async () => null }),
    { cancelled: true },
  );
  assert.deepEqual(s, before);
  await assert.rejects(
    importNewProjectMaterial({
      ...options,
      analyze: async () => {
        throw Error("gagal membaca");
      },
    }),
    /gagal membaca/,
  );
  assert.deepEqual(s, before);
  let current = true;
  await assert.rejects(
    importNewProjectMaterial({
      ...options,
      isCurrent: () => current,
      analyze: async () => {
        current = false;
        return { kind: "pdf", content: "Buat 8 slide", warnings: [] };
      },
    }),
    /berubah/,
  );
  assert.deepEqual(s, before);
  const controller = new AbortController();
  await assert.rejects(
    importNewProjectMaterial({
      ...options,
      signal: controller.signal,
      analyze: async () => {
        controller.abort();
        return { kind: "pdf", content: "Batal", warnings: [] };
      },
    }),
  );
  assert.deepEqual(s, before);
});

test("file-first text import works without AI and uses the filename for an untitled task", async () => {
  const s = defaultState();
  const result = await importNewProjectMaterial({
    state: s,
    brief: newTaskBrief(""),
    pick: async () => "/tmp/Catatan kelas.md",
    read: async () => Buffer.from("Buat 3 paragraf."),
    analyze: async () => {
      throw Error("Text must stay local");
    },
    signal: new AbortController().signal,
    isCurrent: () => true,
  });
  assert.equal(result.added, true);
  assert.equal(s.projects.length, 1);
  assert.equal(activeProject(s)!.name, "Catatan kelas");
  assert.equal(activeProject(s)!.deadline, null);
  assert.equal(activeProject(s)!.materials[0].content, "Buat 3 paragraf.");
});
