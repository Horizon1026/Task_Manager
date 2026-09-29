import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedTaskDeadline } from '../src/ganttDeadline';
import { dayNumber } from '../src/dateCalendar';
import { project, task } from './fixtures';

test('selected leaf deadlines mark the inclusive morning/afternoon boundary', () => {
  const p = project([task('am', { latest_finish: { date: '2026-09-18', period: 'am' } }), task('pm', { latest_finish: { date: '2026-09-18', period: 'pm' } })]);
  const shown = new Set(['am', 'pm']);
  assert.equal(selectedTaskDeadline(p, 'am', shown)?.slot, dayNumber('2026-09-18') * 2 + 1);
  assert.equal(selectedTaskDeadline(p, 'pm', shown)?.slot, dayNumber('2026-09-19') * 2);
});

test('deadline lines exclude unselected, hidden, parent and undated tasks', () => {
  const p = project([task('parent', { latest_finish: { date: '2026-09-18', period: 'pm' } }), task('child', { parent_uid: 'parent' }), task('dated', { latest_finish: { date: '2026-09-19', period: 'pm' } })]);
  const shown = new Set(['parent', 'child']);
  for (const selected of [null, 'parent', 'child', 'dated', 'missing']) assert.equal(selectedTaskDeadline(p, selected, shown), null);
});
