import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';

test('v0.5.1 SQLite state upgrades without losing chat, tasks or preferences', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bito-upgrade-'));
  const path = join(dir, 'bito.sqlite');
  // v0.5.1 stored a JSON app_state and had no projects or activeProjectId.
  const old = { onboarded: true, onboardingStep: 2, profile: { name: 'QA', project: 'Synthetic', style: 'chill', proactive: 'on-demand' }, settings: { size: 190, reducedMotion: true }, messages: [{ id: 'qa-message', role: 'user', text: 'Synthetic retained message', at: 1 }], tasks: [{ id: 'qa-task', title: 'Retained task', done: false }], reminders: [], memories: ['Synthetic memory'], focus: { duration: 900, remaining: 900, deadline: null, running: false }, sleeping: false, position: { x: 50, y: 50 } };
  try {
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    db.prepare('INSERT INTO app_state VALUES (1, ?)').run(JSON.stringify(old)); db.close();
    let store = new Store(path);
    const upgraded = store.load();
    assert.deepEqual(upgraded.messages, old.messages); assert.deepEqual(upgraded.tasks, old.tasks);
    assert.deepEqual(upgraded.memories, old.memories); assert.deepEqual(upgraded.projects, []);
    assert.equal(upgraded.activeProjectId, null); assert.equal(upgraded.settings.size, 190);
    assert.equal(upgraded.settings.reducedMotion, true);
    store.save(upgraded); store.close(); store = new Store(path);
    assert.deepEqual(store.load(), upgraded); store.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
