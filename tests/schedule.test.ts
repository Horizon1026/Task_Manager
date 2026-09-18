import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../src/model';
import { dayNumber, durationBetween, formatSlot, fromSlot, makeCalendar, moveSiblingTask, moveTask, normalizeTreeOrder, scheduleProject, scheduleProjectPlan, setTaskParent, toSlot } from '../src/schedule';
import { alignStart, timeColumns } from '../src/timeline';
import { project, task } from './fixtures';

test('half-day slots round-trip, including pre-epoch dates', () => {
  for (const date of ['1900-01-01', '1960-06-04', '2026-09-14', '2199-12-31']) for (const period of ['am', 'pm'] as const) assert.deepEqual(fromSlot(toSlot({ date, period })), { date, period });
});
test('default starts on project morning; 0.5 day finishes that morning', () => {
  const s = scheduleProject(project()).get('a')!;
  assert.equal(formatSlot(s.start), '2026-09-14 上午'); assert.equal(formatSlot(s.end - 1), '2026-09-14 上午');
});
test('1.5 days finishes next morning, finish-start dependency starts next afternoon', () => {
  const s = scheduleProject(project([task('a', { duration_days: 1.5 }), task('b', { dependencies: ['a'] })]));
  assert.equal(formatSlot(s.get('a')!.end - 1), '2026-09-15 上午'); assert.equal(formatSlot(s.get('b')!.start), '2026-09-15 下午');
});
test('dependency uses latest completion regardless of row order', () => {
  const s = scheduleProject(project([task('c', { dependencies: ['a', 'b'] }), task('a', { duration_days: 1 }), task('b', { duration_days: 2 })]));
  assert.equal(formatSlot(s.get('c')!.start), '2026-09-16 上午');
});
test('assignee tasks overlap when allowed and serialize by leaf order when disabled', () => {
  const value = project([task('a', { duration_days: 1 }), task('b', { duration_days: 1 })]);
  const parallel = scheduleProject(value);
  assert.equal(parallel.get('a')!.start, parallel.get('b')!.start);
  value.project.allow_assignee_parallel_tasks = false;
  const serial = scheduleProject(value);
  assert.equal(serial.get('b')!.dependencyFloor, serial.get('a')!.end);
  assert.equal(serial.get('b')!.start, serial.get('a')!.end);
  assert.deepEqual(value.tasks.map(item => item.dependencies), [[], []]);
});
test('assignee serialization ignores parents and does not constrain different assignees', () => {
  const value = project([
    task('parent', { assignee: '甲' }), task('child', { parent_uid: 'parent', assignee: '甲' }),
    task('other', { assignee: '乙' }), task('next', { assignee: '甲' }),
  ]);
  value.project.assignees = ['甲', '乙']; value.project.allow_assignee_parallel_tasks = false;
  const schedule = scheduleProject(value);
  assert.equal(schedule.get('other')!.start, schedule.get('child')!.start);
  assert.equal(schedule.get('next')!.start, schedule.get('child')!.end);
});
test('explicit dependencies override display order without creating a resource cycle', () => {
  const value = project([task('a', { dependencies: ['b'] }), task('b')]);
  value.project.allow_assignee_parallel_tasks = false;
  const plan = scheduleProjectPlan(value);
  assert.equal(plan.schedule.get('a')!.start, plan.schedule.get('b')!.end);
  assert.deepEqual(plan.dependencyEdges, [{ from: 'b', to: 'a', kind: 'explicit' }]);
});
test('resource list scheduling resolves backward dependencies deterministically and keeps one assignee non-overlapping', () => {
  const value = project([
    task('a', { dependencies: ['f'] }), task('b'), task('c'),
    task('d', { dependencies: ['c'] }), task('e'), task('f', { dependencies: ['e'] }),
  ]);
  value.project.allow_assignee_parallel_tasks = false;
  const before = structuredClone(value.tasks), first = scheduleProjectPlan(value), second = scheduleProjectPlan(value);
  const scheduledOrder = [...first.schedule].filter(([uid]) => value.tasks.some(item => item.uid === uid)).sort((left, right) => left[1].start - right[1].start).map(([uid]) => uid);
  assert.deepEqual(scheduledOrder, ['b', 'c', 'd', 'e', 'f', 'a']);
  assert.deepEqual(first.dependencyEdges, [
    { from: 'f', to: 'a', kind: 'explicit' },
    { from: 'c', to: 'd', kind: 'explicit' },
    { from: 'e', to: 'f', kind: 'explicit' },
    { from: 'b', to: 'c', kind: 'assignee' },
    { from: 'd', to: 'e', kind: 'assignee' },
  ]);
  for (let index = 1; index < scheduledOrder.length; index++) assert.equal(first.schedule.get(scheduledOrder[index])!.start, first.schedule.get(scheduledOrder[index - 1])!.end);
  assert.deepEqual([...second.schedule], [...first.schedule]);
  assert.deepEqual(second.dependencyEdges, first.dependencyEdges);
  assert.deepEqual(value.tasks, before);
});
test('resource list scheduling avoids idle time before a higher-priority future task', () => {
  const value = project([
    task('future', { earliest_start: { date: '2026-09-21', period: 'am' } }),
    task('ready'),
  ]);
  value.project.allow_assignee_parallel_tasks = false;
  const plan = scheduleProjectPlan(value);
  assert.equal(formatSlot(plan.schedule.get('ready')!.start), '2026-09-14 上午');
  assert.equal(formatSlot(plan.schedule.get('future')!.start), '2026-09-21 上午');
  assert.deepEqual(plan.dependencyEdges, [{ from: 'ready', to: 'future', kind: 'assignee' }]);
});
test('weekend skip does not count rest time in duration', () => {
  const t = task('a', { earliest_start: { date: '2026-09-18', period: 'pm' }, duration_days: 1 });
  const p = project([t]), s = scheduleProject(p).get('a')!;
  assert.equal(formatSlot(s.end - 1), '2026-09-21 上午');
  assert.equal(durationBetween(s.start, s.end, t, makeCalendar(p)), 1);
});
test('allow rest-day work uses Saturday and ignores holiday closures', () => {
  const p = project([task('a', { earliest_start: { date: '2026-09-18', period: 'pm' }, duration_days: 1, allow_rest_day_work: true })]);
  p.calendar.overrides.push({ date: '2026-09-19', is_workday: false, note: '' });
  const s = scheduleProject(p).get('a')!;
  assert.equal(formatSlot(s.end - 1), '2026-09-19 上午'); assert.deepEqual(s.unknownYears, []);
});
test('successor uses own calendar after weekend predecessor completion', () => {
  const p = project([task('a', { earliest_start: { date: '2026-09-19', period: 'am' }, allow_rest_day_work: true }), task('b', { dependencies: ['a'] })]);
  assert.equal(formatSlot(scheduleProject(p).get('b')!.start), '2026-09-21 上午');
});
test('holiday data, makeup workdays and local overrides have the correct precedence', () => {
  const p = project();
  p.calendar.years.push({ year: 2026, source: 'test', fetched_at: '', papers: ['test'], days: [{ date: '2026-09-14', name: '休息', isOffDay: true }, { date: '2026-09-19', name: '补班', isOffDay: false }] });
  assert.equal(makeCalendar(p)('2026-09-19').isWorkday, true);
  assert.equal(formatSlot(scheduleProject(p).get('a')!.start), '2026-09-15 上午');
  p.calendar.overrides.push({ date: '2026-09-14', is_workday: true, note: '本地工作日' });
  assert.equal(formatSlot(scheduleProject(p).get('a')!.start), '2026-09-14 上午');
});
test('following year announcement can override December dates', () => {
  const p = project();
  p.calendar.years.push({ year: 2027, source: 'test', fetched_at: '', papers: ['test'], days: [{ date: '2026-12-31', isOffDay: true, name: '元旦' }] });
  assert.equal(makeCalendar(p)('2026-12-31').isWorkday, false);
});
test('deadline includes its half-day; only later completion warns', () => {
  const p = project([task('a', { duration_days: 1, latest_finish: { date: '2026-09-14', period: 'pm' } })]);
  assert.equal(scheduleProject(p).get('a')!.late, false);
  p.tasks[0].latest_finish!.period = 'am'; assert.equal(scheduleProject(p).get('a')!.late, true);
  p.tasks[0].latest_finish = null; assert.equal(scheduleProject(p).get('a')!.late, false);
});
test('missing years are flagged and completed status does not change scheduling', () => {
  assert.deepEqual(scheduleProject(project([task('a', { status: '已完成' })])).get('a')!.unknownYears, [2026]);
});
test('parent task automatically rolls up nested leaf task schedules', () => {
  const p = project([
    task('parent', { duration_days: 9, latest_finish: { date: '2026-09-16', period: 'pm' } }),
    task('group', { parent_uid: 'parent', duration_days: 8 }),
    task('first', { parent_uid: 'group', duration_days: 1 }),
    task('second', { parent_uid: 'group', earliest_start: { date: '2026-09-16', period: 'pm' }, duration_days: 1 }),
  ]);
  const schedule = scheduleProject(p);
  assert.equal(formatSlot(schedule.get('group')!.start), '2026-09-14 上午');
  assert.equal(formatSlot(schedule.get('group')!.end - 1), '2026-09-17 上午');
  assert.equal(schedule.get('parent')!.start, schedule.get('group')!.start);
  assert.equal(schedule.get('parent')!.end, schedule.get('group')!.end);
  assert.equal(schedule.get('parent')!.late, true);
});
test('moving rows preserves UIDs and dependencies, reindexes and sorts YAML order', () => {
  const p = moveTask(project([task('a'), task('b', { dependencies: ['a'] })]), 'b', 1);
  assert.deepEqual(p.tasks.map(t => [t.uid, t.order]), [['b', 1], ['a', 2]]);
  assert.deepEqual(p.tasks[0].dependencies, ['a']); validateProject(p);
});
test('first child receives every dependency edge of its parent, with duplicates removed; later children inherit nothing', () => {
  const original = project([task('a', { dependencies: ['b', 'e'] }), task('b'), task('c', { dependencies: ['e', 'f'], duration_days: 2 }), task('d', { dependencies: ['f'] }), task('e'), task('f'), task('g', { dependencies: ['a', 'c'] })]);
  const before = structuredClone(original);
  const first = setTaskParent(original, 'c', 'a');
  assert.deepEqual(first.tasks.find(t => t.uid === 'a')!.dependencies, []);
  assert.deepEqual(first.tasks.find(t => t.uid === 'c'), { ...original.tasks[2], parent_uid: 'a', order: 2, dependencies: ['e', 'f', 'b'] });
  assert.deepEqual(first.tasks.find(t => t.uid === 'g')!.dependencies, ['c']);
  assert.deepEqual(original, before);
  const second = setTaskParent(first, 'd', 'a');
  assert.deepEqual(second.tasks.find(t => t.uid === 'd')!.dependencies, ['f']);
  assert.deepEqual(second.tasks.find(t => t.uid === 'c')!.dependencies, ['e', 'f', 'b']);
  assert.deepEqual(second.tasks.find(t => t.uid === 'g')!.dependencies, ['c']);
  assert.deepEqual(second.tasks.map(t => t.order), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(scheduleProject(second).get('c')!.dependencyFloor, scheduleProject(second).get('b')!.end);
});
test('detaching does not restore prerequisites and reparenting a subtree preserves its children', () => {
  const first = setTaskParent(project([task('a', { dependencies: ['b'] }), task('b'), task('c'), task('d')]), 'c', 'a');
  assert.equal(setTaskParent(first, 'c', 'a'), first);
  const detached = setTaskParent(first, 'c', null);
  assert.deepEqual(detached.tasks.find(t => t.uid === 'a')!.dependencies, []);
  assert.deepEqual(detached.tasks.find(t => t.uid === 'c')!.dependencies, ['b']);
  assert.deepEqual(setTaskParent(detached, 'd', 'a').tasks.find(t => t.uid === 'd')!.dependencies, []);
  const moved = setTaskParent(first, 'a', 'd');
  assert.deepEqual(moved.tasks.map(t => t.uid), ['b', 'd', 'a', 'c']);
  assert.equal(moved.tasks.find(t => t.uid === 'c')!.parent_uid, 'a');
});
test('invalid dependency migration and parent cycles fail atomically without losing tasks', () => {
  const cases: [ReturnType<typeof project>, string, string, RegExp][] = [
    [project([task('a'), task('b', { dependencies: ['a'] })]), 'b', 'a', /循环依赖/],
    [project([task('a', { dependencies: ['b'] }), task('b', { dependencies: ['c'] }), task('c')]), 'c', 'a', /循环依赖/],
    [project([task('a', { dependencies: ['c'] }), task('c')]), 'c', 'a', /循环依赖/],
    [project([task('a', { dependencies: ['b'] }), task('b'), task('c'), task('d', { parent_uid: 'c' })]), 'c', 'a', /不能承接/],
    [project([task('a'), task('b'), task('c', { parent_uid: 'b' }), task('d', { dependencies: ['a'] })]), 'b', 'a', /不能承接/],
    [project([task('a'), task('c', { parent_uid: 'a' })]), 'a', 'c', /循环父子关系/],
    [project(), 'a', 'a', /自身/], [project(), 'a', 'missing', /不存在/], [project(), 'missing', 'a', /不存在/],
  ];
  for (const [value, uid, parent, message] of cases) {
    const before = structuredClone(value);
    assert.throws(() => setTaskParent(value, uid, parent), message);
    assert.deepEqual(value, before);
  }
});
test('tree order keeps each parent subtree contiguous while preserving sibling order', () => {
  const p = project([
    task('root-b', { order: 1 }), task('child-b', { order: 2, parent_uid: 'root-a' }),
    task('root-a', { order: 3 }), task('grandchild', { order: 4, parent_uid: 'child-b' }),
    task('child-a', { order: 5, parent_uid: 'root-a' }),
  ]);
  const ordered = normalizeTreeOrder(p);
  assert.deepEqual(ordered.tasks.map(task => task.uid), ['root-b', 'root-a', 'child-b', 'grandchild', 'child-a']);
  assert.deepEqual(ordered.tasks.map(task => task.order), [1, 2, 3, 4, 5]);
});

test('moving a sibling keeps the task subtree together and rejects cross-level moves', () => {
  const value = project([
    task('root-a'), task('child-a', { parent_uid: 'root-a' }), task('root-b'), task('child-b', { parent_uid: 'root-b' }), task('root-c'),
  ]);
  const moved = moveSiblingTask(value, 'root-c', 'root-a');
  assert.deepEqual(moved.tasks.map(task => task.uid), ['root-c', 'root-a', 'child-a', 'root-b', 'child-b']);
  assert.throws(() => moveSiblingTask(value, 'child-a', 'root-b'), /同一层级/);
});
test('rejects self-dependencies, cycles, dangling references, duplicate UIDs and order', () => {
  assert.throws(() => validateProject(project([task('a', { dependencies: ['a'] })])), /循环/);
  assert.throws(() => validateProject(project([task('a', { dependencies: ['b'] }), task('b', { dependencies: ['a'] })])), /循环/);
  assert.throws(() => validateProject(project([task('a', { dependencies: ['missing'] })])), /不存在/);
  assert.throws(() => validateProject(project([task('a'), task('a')])), /UID 重复/);
  const p = project(); p.tasks[0].order = 2; assert.throws(() => validateProject(p), /排序/);
});
test('parent UID forms an acyclic forest and only leaves can have dependencies', () => {
  assert.throws(() => validateProject(project([task('a', { parent_uid: 'a' })])), /自身的父任务/);
  assert.throws(() => validateProject(project([task('a', { parent_uid: 'missing' })])), /父任务不存在/);
  assert.throws(() => validateProject(project([task('a', { parent_uid: 'b' }), task('b', { parent_uid: 'a' })])), /循环父子关系/);
  assert.throws(() => validateProject(project([task('parent', { dependencies: ['leaf'] }), task('leaf', { parent_uid: 'parent' })])), /父任务.*前置依赖/);
  assert.throws(() => validateProject(project([task('parent'), task('leaf', { parent_uid: 'parent', dependencies: ['parent'] })])), /不能依赖父任务/);
});
test('rejects invalid dates and duration without treating impossible deadlines as invalid', () => {
  assert.throws(() => validateProject(project([task('a', { duration_days: 0.7 })])));
  assert.throws(() => validateProject(project([task('a', { earliest_start: { date: '2026-02-30', period: 'am' } })])));
  assert.throws(() => validateProject(project([task('a', { duration_days: 0 })])));
});
test('seven time scales align natural calendar boundaries', () => {
  assert.equal(alignStart(dayNumber('2026-09-16'), 'week'), dayNumber('2026-09-14'));
  assert.equal(alignStart(dayNumber('2026-08-16'), 'quarter'), dayNumber('2026-07-01'));
  assert.equal(alignStart(dayNumber('2026-08-16'), 'half-year'), dayNumber('2026-07-01'));
  assert.equal(alignStart(dayNumber('2026-08-16'), 'year'), dayNumber('2026-01-01'));
  const cols = timeColumns(dayNumber('2026-02-01'), dayNumber('2026-03-01'), 'half-month');
  assert.deepEqual(cols.map(c => c.end - c.start), [15, 13]);
});
