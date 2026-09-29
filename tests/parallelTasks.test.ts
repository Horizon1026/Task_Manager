import test from 'node:test';
import assert from 'node:assert/strict';
import { project, task } from './fixtures';
import { parallelTaskUids } from '../src/parallelTasks';
import { scheduleProject, type Scheduled } from '../src/schedule';

const interval = (start: number, end: number): Scheduled => ({ start, end, dependencyFloor: -Infinity, late: false, unknownYears: [] });
test('marks all overlapping leaf intervals, including nested and chained intervals, but excludes adjacent work', () => {
  const p = project(['long', 'nested', 'chain', 'next', 'other', 'unknown', 'unknown2', 'parent'].map(uid => task(uid, { assignee: uid === 'other' ? '乙' : uid.startsWith('unknown') ? '未指定' : '甲', parent_uid: uid === 'long' ? 'parent' : null })));
  const schedule = new Map([['long', interval(0, 6)], ['nested', interval(1, 2)], ['chain', interval(5, 8)], ['next', interval(8, 9)], ['other', interval(0, 9)], ['unknown', interval(0, 9)], ['unknown2', interval(0, 9)], ['parent', interval(0, 9)]]);
  assert.deepEqual([...parallelTaskUids(p, schedule)].sort(), ['chain', 'long', 'nested']);
});
test('serialization removes same-assignee parallel warnings', () => {
  const p = project([task('a', { assignee: '甲', duration_days: 2 }), task('b', { assignee: '甲' })]);
  p.project.assignees = ['甲'];
  assert.equal(parallelTaskUids(p, scheduleProject(p)).size, 2);
  p.project.allow_assignee_parallel_tasks = false;
  assert.equal(parallelTaskUids(p, scheduleProject(p)).size, 0);
});
