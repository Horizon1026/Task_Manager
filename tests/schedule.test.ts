import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../src/model';
import { dayNumber, durationBetween, formatSlot, fromSlot, makeCalendar, moveTask, scheduleProject, toSlot } from '../src/schedule';
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
test('moving rows preserves UIDs and dependencies, reindexes and sorts YAML order', () => {
  const p = moveTask(project([task('a'), task('b', { dependencies: ['a'] })]), 'b', 1);
  assert.deepEqual(p.tasks.map(t => [t.uid, t.order]), [['b', 1], ['a', 2]]);
  assert.deepEqual(p.tasks[0].dependencies, ['a']); validateProject(p);
});
test('rejects self-dependencies, cycles, dangling references, duplicate UIDs and order', () => {
  assert.throws(() => validateProject(project([task('a', { dependencies: ['a'] })])), /循环/);
  assert.throws(() => validateProject(project([task('a', { dependencies: ['b'] }), task('b', { dependencies: ['a'] })])), /循环/);
  assert.throws(() => validateProject(project([task('a', { dependencies: ['missing'] })])), /不存在/);
  assert.throws(() => validateProject(project([task('a'), task('a')])), /UID 重复/);
  const p = project(); p.tasks[0].order = 2; assert.throws(() => validateProject(p), /排序/);
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
