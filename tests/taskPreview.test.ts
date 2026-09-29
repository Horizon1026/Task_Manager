import test from 'node:test';
import assert from 'node:assert/strict';
import { durationFromInput, projectForPreview } from '../src/taskPreview';
import { scheduleProjectPlan } from '../src/schedule';
import { validateProject } from '../src/model';
import { project, task } from './fixtures';

test('blank titles keep the complete dependent schedule visible without altering the draft', () => {
  const draft = project([task('a', { name: '   ', duration_days: 2 }), task('b', { dependencies: ['a'] })]);
  const preview = projectForPreview(draft);
  const plan = scheduleProjectPlan(preview);
  assert.equal(preview.tasks[0].name, 'a');
  assert.equal(draft.tasks[0].name, '   ');
  assert.equal(plan.schedule.size, 2);
  assert.equal(plan.schedule.get('b')!.start, plan.schedule.get('a')!.end);
  assert.throws(() => validateProject(draft), /任务名称不能为空/);
});

test('invalid duration edits use the configured default, including incomplete input and range/step errors', () => {
  for (const input of ['', ' ', '-', '1e', 'NaN', 'Infinity', '0', '-1', '0.7', '36500.5']) {
    assert.equal(durationFromInput(input, 3.5), 3.5, input);
  }
  for (const input of ['0.5', '1', '1.5', '36500']) {
    assert.equal(durationFromInput(input, 3.5), Number(input));
  }
});
