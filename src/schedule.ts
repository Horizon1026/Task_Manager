import { validateProject, type Project, type Task, type HalfDay } from './model';

const DAY = 86_400_000;
export const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
export const dateString = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const toSlot = (m: HalfDay) => dayNumber(m.date) * 2 + (m.period === 'pm' ? 1 : 0);
export const fromSlot = (slot: number): HalfDay => ({ date: dateString(Math.floor(slot / 2)), period: slot % 2 === 0 ? 'am' : 'pm' });
export const formatSlot = (slot: number) => { const m = fromSlot(slot); return `${m.date} ${m.period === 'am' ? '上午' : '下午'}`; };
export const formatMoment = (m: HalfDay | null) => m ? `${m.date} ${m.period === 'am' ? '上午' : '下午'}` : '未设置';
export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function makeCalendar(project: Project) {
  const days = new Map<string, { isOffDay: boolean; name: string }>();
  // Later annual announcements take precedence at a year boundary.
  for (const year of [...project.calendar.years].sort((a, b) => a.year - b.year)) for (const d of year.days) days.set(d.date, d);
  const overrides = new Map(project.calendar.overrides.map(o => [o.date, o]));
  const years = new Set(project.calendar.years.map(y => y.year));
  return (date: string) => {
    const override = overrides.get(date), special = days.get(date);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    return {
      isWorkday: override ? override.is_workday : special ? !special.isOffDay : !weekend,
      name: override ? override.note || '本地修正' : special?.name || (weekend ? '周末' : '工作日'),
      overridden: !!override,
      known: !!override || !!special || years.has(Number(date.slice(0, 4))),
    };
  };
}
export type CalendarLookup = ReturnType<typeof makeCalendar>;
export type Scheduled = { start: number; end: number; dependencyFloor: number; late: boolean; unknownYears: number[] };
const LIMIT_SLOT = dayNumber('2199-12-31') * 2 + 2;
export function nextWorkSlot(slot: number, task: Task, calendar: CalendarLookup): number {
  let value = slot;
  while (value < LIMIT_SLOT) {
    if (task.allow_rest_day_work || calendar(dateString(Math.floor(value / 2))).isWorkday) return value;
    value = (Math.floor(value / 2) + 1) * 2;
  }
  throw new Error('排期超出了支持范围（2199 年）');
}
export function durationBetween(start: number, end: number, task: Task, calendar: CalendarLookup) {
  let count = 0;
  for (let slot = start; slot < end; slot++) if (task.allow_rest_day_work || calendar(dateString(Math.floor(slot / 2))).isWorkday) count++;
  return count / 2;
}
export function scheduleProject(input: Project): Map<string, Scheduled> {
  const p = validateProject(input), calendar = makeCalendar(p);
  const tasks = new Map(p.tasks.map(t => [t.uid, t]));
  const children = new Map<string, string[]>();
  for (const task of p.tasks) if (task.parent_uid !== null) {
    const value = children.get(task.parent_uid) ?? [];
    value.push(task.uid); children.set(task.parent_uid, value);
  }
  const result = new Map<string, Scheduled>();
  function schedule(uid: string): Scheduled {
    const previous = result.get(uid); if (previous) return previous;
    const task = tasks.get(uid)!;
    const childIds = children.get(uid);
    if (childIds?.length) {
      const childSchedules = childIds.map(schedule);
      const end = Math.max(...childSchedules.map(value => value.end));
      const value: Scheduled = {
        start: Math.min(...childSchedules.map(value => value.start)), end, dependencyFloor: -Infinity,
        late: task.latest_finish !== null && end > toSlot(task.latest_finish) + 1,
        unknownYears: [...new Set(childSchedules.flatMap(value => value.unknownYears))].sort(),
      };
      result.set(uid, value); return value;
    }
    const dependencyFloor = task.dependencies.reduce((latest, dep) => Math.max(latest, schedule(dep).end), -Infinity);
    const earliest = toSlot(task.earliest_start ?? { date: p.project.start_date, period: 'am' });
    const constraint = Math.max(earliest, dependencyFloor);
    const start = nextWorkSlot(constraint, task, calendar);
    const unknownYears = new Set<number>();
    const observe = (slot: number) => {
      const date = dateString(Math.floor(slot / 2));
      if (!task.allow_rest_day_work && !calendar(date).known) unknownYears.add(Number(date.slice(0, 4)));
    };
    for (let s = constraint; s < start; s += 2) observe(s);
    let cursor = start, remaining = task.duration_days * 2;
    while (remaining > 0) {
      if (cursor >= LIMIT_SLOT) throw new Error('排期超出了支持范围（2199 年）');
      observe(cursor);
      if (task.allow_rest_day_work || calendar(dateString(Math.floor(cursor / 2))).isWorkday) remaining--;
      cursor++;
    }
    const value: Scheduled = { start, end: cursor, dependencyFloor,
      late: task.latest_finish !== null && cursor > toSlot(task.latest_finish) + 1,
      unknownYears: [...unknownYears].sort(),
    };
    result.set(uid, value); return value;
  }
  for (const task of p.tasks) schedule(task.uid);
  return result;
}

export function moveTask(project: Project, uid: string, targetOrder: number): Project {
  const ordered = [...project.tasks].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex(t => t.uid === uid);
  if (index < 0) throw new Error('任务不存在');
  const [task] = ordered.splice(index, 1);
  ordered.splice(Math.max(0, Math.min(ordered.length, targetOrder - 1)), 0, task);
  return normalizeTreeOrder({ ...project, tasks: ordered.map((t, i) => ({ ...t, order: i + 1 })) });
}

/** Keep each subtree contiguous while preserving the current order among siblings. */
export function normalizeTreeOrder(project: Project): Project {
  const children = new Map<string | null, Task[]>();
  for (const task of project.tasks) {
    const value = children.get(task.parent_uid) ?? [];
    value.push(task); children.set(task.parent_uid, value);
  }
  const ordered: Task[] = [];
  function visit(parent: string | null) {
    for (const task of (children.get(parent) ?? []).sort((a, b) => a.order - b.order)) {
      ordered.push(task); visit(task.uid);
    }
  }
  visit(null);
  return { ...project, tasks: ordered.map((task, order) => ({ ...task, order: order + 1 })) };
}
