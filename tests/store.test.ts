import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify } from 'yaml';
import { ProjectStore, parseProject, revisionOf } from '../server/store';
import { project } from './fixtures';

async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'mission-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'project.yaml'); await writeFile(file, stringify(project())); return new ProjectStore(file);
}
test('save persists edited data and creates identical saved snapshot plus original backup', async t => {
  const store = await setup(t), base = await store.read();
  base.project.tasks[0].name = '已修改'; const saved = await store.save(base.project, base.revision);
  assert.equal((await store.read()).project.tasks[0].name, '已修改');
  assert.equal(await readFile(join(store.backupDir, saved.backup!), 'utf8'), await readFile(store.file, 'utf8'));
  const names = await store.list(); assert.equal(names.length, 2);
  const original = names.find(n => n.includes('_initial_'))!;
  await store.restore(original, saved.revision);
  assert.equal((await store.read()).project.tasks[0].name, 'a'); assert.equal((await store.list()).length, 3);
});
test('external modifications prevent stale save and preserve file', async t => {
  const store = await setup(t), base = await store.read();
  const other = project(); other.project.name = '外部修改'; await writeFile(store.file, stringify(other));
  await assert.rejects(store.save(base.project, base.revision), /外部修改/);
  assert.equal((await store.read()).project.project.name, '外部修改'); assert.equal((await store.list()).length, 0);
});
test('simultaneous stale saves cannot overwrite one another', async t => {
  const store = await setup(t), base = await store.read();
  const first = structuredClone(base.project), second = structuredClone(base.project);
  first.project.name = 'first'; second.project.name = 'second';
  const result = await Promise.allSettled([store.save(first, base.revision), store.save(second, base.revision)]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected');
});
test('saving unchanged content still produces a new backup', async t => {
  const store = await setup(t), base = await store.read();
  const first = await store.save(base.project, base.revision); await store.save(first.project, first.revision);
  assert.equal((await store.list()).length, 3);
});
test('invalid restore and path traversal cannot modify the project', async t => {
  const store = await setup(t), base = await store.read();
  await assert.rejects(store.restore('../project.yaml', base.revision), /无效备份/);
  await mkdir(store.backupDir, { recursive: true }); await writeFile(join(store.backupDir, 'invalid.yaml'), 'tasks: [');
  await assert.rejects(store.restore('invalid.yaml', base.revision));
  assert.equal((await store.read()).revision, base.revision);
});
test('YAML errors and duplicate keys are reported instead of silently overwritten', () => {
  assert.throws(() => parseProject('tasks: [')); assert.throws(() => parseProject('version: 1\nversion: 1'));
  assert.notEqual(revisionOf('abc'), revisionOf('abc\n'));
});
