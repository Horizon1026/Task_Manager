import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTaskDefaults } from '../server/taskDefaults';

test('task defaults YAML provides every editable default and excludes generated relationships', async () => {
  const value = parseTaskDefaults(await readFile('task_defaults.yaml', 'utf8'));
  assert.equal(value.duration_days, 2);
  assert.equal(value.assignee, null);
  assert.equal('uid' in value, false);
  assert.equal('dependencies' in value, false);
});

test('task defaults YAML rejects duplicate, generated, incomplete, and invalid fields', () => {
  const valid = 'name: 新任务\ndescription: ""\nassignee: null\nstatus: 未开始\nearliest_start: null\nlatest_finish: null\nduration_days: 2\ncollapse_children: false\nlabels: []\nallow_rest_day_work: false\n';
  assert.throws(() => parseTaskDefaults(valid + 'duration_days: 1\n'), /unique|Map keys must be unique/i);
  assert.throws(() => parseTaskDefaults(valid + 'dependencies: []\n'), /Unrecognized key/);
  assert.throws(() => parseTaskDefaults(valid.replace('duration_days: 2\n', '')), /Required/);
  assert.throws(() => parseTaskDefaults(valid.replace('duration_days: 2', 'duration_days: 0.7')), /multiple of 0.5/);
});
