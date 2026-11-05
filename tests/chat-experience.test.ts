import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ChatFiles, chatFileContext, readChatFile } from "../electron/chat-files";
import { defaultState } from "../electron/core";
import { newProject } from "../src/projects";
import { savedWorkQuery, prioritizedWork } from "../src/saved-work";
import { characterSpeaking, SpeechHold } from "../src/character-speech";
import { messageBubbleTexts } from "../src/reply-bubbles";
import type { Snapshot } from "../src/shared";

function material(content = "Catatan tugas") {
  return { id: randomUUID(), name: "tugas.md", content, kind: "text" as const, warnings: [] as string[], createdAt: Date.now() };
}
test("staged chat files are private, scoped to account and project, unique and expiring", () => {
  let now = 0;
  const files = new ChatFiles(() => now), scope = { account: "a", projectId: null };
  const file = files.stage(material("private evidence"), scope);
  assert.equal("content" in file, false);
  assert.equal(files.get([file.id], scope)[0].content, "private evidence");
  assert.throws(() => files.get([file.id], { ...scope, account: "b" }));
  assert.throws(() => files.get([file.id], { ...scope, projectId: randomUUID() }));
  assert.throws(() => files.get([file.id, file.id], scope));
  now = 60 * 60000;
  assert.throws(() => files.get([file.id], scope));
  const next = files.stage(material(), scope);
  files.remove([next.id]);
  assert.throws(() => files.get([next.id], scope));
  const previous = files.stage(material(), scope);
  files.stage(material(), { ...scope, projectId: randomUUID() });
  assert.throws(() => files.get([previous.id], scope));
});
test("chat file context is bounded and reports truncation and reader warnings", () => {
  const m = material("x".repeat(48000));
  m.warnings = ["Teks pada gambar kurang jelas"];
  const context = chatFileContext([m, material("y".repeat(48000)), material("z".repeat(48000))]);
  assert.ok(context.length < 24000);
  assert.match(context, /Isi dipotong/);
  assert.match(context, /gambar kurang jelas/);
});
test("text attachment reader reuses validation without creating a saved project", async () => {
  const base = { path: "/tmp/notes.md", signal: new AbortController().signal, isCurrent: () => true,
    read: async () => new TextEncoder().encode("# Tugas\nBuat presentasi"),
    analyze: async () => { throw Error("Text must not call model"); } };
  const m = await readChatFile(base);
  assert.equal(m.name, "notes.md");
  assert.match(m.content, /Buat presentasi/);
  await assert.rejects(readChatFile({ ...base, isCurrent: () => false }), /berubah/);
  await assert.rejects(readChatFile({ ...base, read: async () => new Uint8Array([0]) }), /bukan dokumen teks/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readChatFile({ ...base, signal: controller.signal }));
});
test("visual work requests distinguish saved schedules from creating or editing work", () => {
  assert.equal(savedWorkQuery("aku ada tugas apa aja?"), "tasks");
  assert.equal(savedWorkQuery("lihat kalender tugasku"), "schedule");
  assert.equal(savedWorkQuery("prioritas tugasku"), "priority");
  for (const text of ["bikin jadwal tugasku", "ubah deadline tugas", "tugas aku apa aja hari ini?", "gimana cara ngerjain tugas?"])
    assert.equal(savedWorkQuery(text), null);
});
test("priority cards sort saved deadlines, exclude archived/completed and do not mutate", () => {
  const s = defaultState();
  s.projects = [null, "2026-11-01", "2026-10-30", "2026-10-31"].map((deadline, index) => newProject({ name: `Tugas ${index}`, brief: "", outcome: "", deadline, availability: "" }));
  const completed = newProject({ name: "Beres", brief: "", outcome: "", deadline: "2026-01-01", availability: "" });
  completed.status = "completed"; s.projects.push(completed);
  const before = JSON.stringify(s);
  assert.deepEqual(prioritizedWork(s, "2026-10-31").map(p => p.reason), ["Lewat tenggat", "Hari ini", "Tenggat terdekat", "Belum ada tenggat"]);
  assert.equal(JSON.stringify(s), before);
});
test("all AI bubble sources drive speech; thinking and silent waits do not", () => {
  const s = { ...defaultState(), busy: false, dragging: false, sleeping: false } as Snapshot;
  assert.equal(characterSpeaking(s), false);
  assert.equal(characterSpeaking({ ...s, greeting: { messageId: "m", phase: "revealing", talking: true } }), true);
  assert.equal(characterSpeaking({ ...s, guideActivity: "talking" }), true);
  assert.equal(characterSpeaking({ ...s, guideActivity: "waiting" }), false);
  assert.equal(characterSpeaking({ ...s, replyActivity: { messageId: "m", phase: "talking" } }), true);
  assert.equal(characterSpeaking({ ...s, replyActivity: { messageId: "m", phase: "thinking" } }), false);
  assert.equal(characterSpeaking({ ...s, guideActivity: "talking", dragging: true }), false);
  assert.equal(characterSpeaking({ ...s, guideActivity: "talking", sleeping: true }), false);
  const hold = new SpeechHold();
  assert.equal(hold.update(true, 1000), true);
  assert.equal(hold.update(false, 1200), true);
  assert.equal(hold.update(false, 1500), false);
  hold.update(true, 2000); hold.reset();
  assert.equal(hold.update(false, 2100), false);
});
test("attachment context stays in model history but user bubble shows only their message", () => {
  const message = { id: "m", role: "user" as const, text: "Explain this\n[Lampiran: private context]", displayText: "Explain this", createdAt: new Date().toISOString() };
  assert.deepEqual(messageBubbleTexts(message), ["Explain this"]);
  assert.match(message.text, /private context/);
});

test("dropping image stages only a preview; analysis starts at resolve and failed sends retain draft", async () => {
  const files = new ChatFiles(), scope = {account:"a",projectId:null};
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10,1]);
  const f = files.stageBytes("/tmp/picture.png",bytes,scope,"data:image/png;base64,preview");
  bytes[8]=99;
  assert.equal(f.preview?.thumbnail,"data:image/png;base64,preview");
  assert.throws(()=>files.get([f.id],scope),/belum dikirim/);
  let calls=0;
  const options = {signal:new AbortController().signal,isCurrent:()=>true,analyze:async()=>{calls++;throw Error("offline");}};
  assert.equal(calls,0);
  await assert.rejects(files.resolve([f.id],scope,options),/offline/);
  assert.equal(files.previews([f.id],scope)[0].name,"picture.png");
  const result = await files.resolve([f.id],scope,{...options,analyze:async()=>{calls++;return {kind:"image",content:"A small diagram",warnings:[]};}});
  assert.equal(result[0].content,"A small diagram");
  await files.resolve([f.id],scope,options);
  assert.equal(calls,2);
});
test("staged text freezes original bytes and removed drafts cannot be processed",async()=>{
  const files=new ChatFiles(),scope={account:"a",projectId:null};
  const bytes=new TextEncoder().encode("Original draft");
  const f=files.stageBytes("/tmp/a.txt",bytes,scope);bytes.fill(65);
  const options={signal:new AbortController().signal,isCurrent:()=>true,analyze:async()=>{throw Error("Must not analyze text");}};
  assert.equal((await files.resolve([f.id],scope,options))[0].content,"Original draft");
  files.remove([f.id]);
  await assert.rejects(files.resolve([f.id],scope,options),/kedaluwarsa/);
});
