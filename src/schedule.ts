import { validateProject, type Project, type Task, type HalfDay } from './model';
import { buildEffectiveDependencyGraph, type EffectiveDependencyEdge } from './effectiveDependencies';

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
export type SchedulePlan = { schedule: Map<string, Scheduled>; dependencyEdges: EffectiveDependencyEdge[] };

/** Deterministic resource-constrained list scheduling for leaf tasks, followed by parent roll-up. */
export function scheduleProjectPlan(input: Project): SchedulePlan {
  const p = validateProject(input), calendar = makeCalendar(p);
  const tasks = new Map(p.tasks.map(t => [t.uid, t]));
  const children = new Map<string, string[]>();
  for (const task of p.tasks) if (task.parent_uid !== null) {
    const value = children.get(task.parent_uid) ?? [];
    value.push(task.uid); children.set(task.parent_uid, value);
  }
  const leaves = p.tasks.filter(task => !children.has(task.uid));
  const leafUids = new Set(leaves.map(task => task.uid));
  const successors = new Map(leaves.map(task => [task.uid, [] as string[]]));
  const indegree = new Map(leaves.map(task => [task.uid, 0]));
  for (const task of leaves) for (const dependency of task.dependencies) if (leafUids.has(dependency)) {
    successors.get(dependency)!.push(task.uid);
    indegree.set(task.uid, indegree.get(task.uid)! + 1);
  }
  const result = new Map<string, Scheduled>();
  const assigneeEnd = new Map<string, number>(), assigneePrevious = new Map<string, string>();
  const resourceEdges: EffectiveDependencyEdge[] = [];
  const explicitPairs = new Set(p.tasks.flatMap(task => task.dependencies.map(dependency => `${dependency}\0${task.uid}`)));

  function candidate(task: Task) {
    const explicitFloor = task.dependencies.reduce((latest, dependency) => Math.max(latest, result.get(dependency)!.end), -Infinity);
    const resourceFloor = p.project.allow_assignee_parallel_tasks ? -Infinity : (assigneeEnd.get(task.assignee) ?? -Infinity);
    const dependencyFloor = Math.max(explicitFloor, resourceFloor);
    const earliest = toSlot(task.earliest_start ?? { date: p.project.start_date, period: 'am' });
    const constraint = Math.max(earliest, dependencyFloor);
    const start = nextWorkSlot(constraint, task, calendar);
    return { task, dependencyFloor, constraint, start };
  }
  function finish({ task, dependencyFloor, constraint, start }: ReturnType<typeof candidate>): Scheduled {
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
    return value;
  }

  const ready = leaves.filter(task => indegree.get(task.uid) === 0);
  while (ready.length) {
    const candidates = ready.map(candidate).sort((left, right) => left.start - right.start || left.task.order - right.task.order || (left.task.uid < right.task.uid ? -1 : left.task.uid > right.task.uid ? 1 : 0));
    const selected = candidates[0];
    ready.splice(ready.findIndex(task => task.uid === selected.task.uid), 1);
    const value = finish(selected);
    result.set(selected.task.uid, value);
    if (!p.project.allow_assignee_parallel_tasks) {
      const previous = assigneePrevious.get(selected.task.assignee);
      if (previous && !explicitPairs.has(`${previous}\0${selected.task.uid}`)) resourceEdges.push({ from: previous, to: selected.task.uid, kind: 'assignee' });
      assigneeEnd.set(selected.task.assignee, value.end);
      assigneePrevious.set(selected.task.assignee, selected.task.uid);
    }
    for (const successor of successors.get(selected.task.uid) ?? []) {
      const remaining = indegree.get(successor)! - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) ready.push(tasks.get(successor)!);
    }
  }
  if (result.size !== leaves.length) throw new Error('显式依赖形成循环，无法完成资源排程。');

  function rollUp(uid: string): Scheduled {
    const existing = result.get(uid); if (existing) return existing;
    const task = tasks.get(uid)!, childSchedules = children.get(uid)!.map(rollUp);
    const end = Math.max(...childSchedules.map(value => value.end));
    const value: Scheduled = {
      start: Math.min(...childSchedules.map(value => value.start)), end, dependencyFloor: -Infinity,
      late: task.latest_finish !== null && end > toSlot(task.latest_finish) + 1,
      unknownYears: [...new Set(childSchedules.flatMap(value => value.unknownYears))].sort(),
    };
    result.set(uid, value); return value;
  }
  for (const task of p.tasks) if (children.has(task.uid)) rollUp(task.uid);
  return { schedule: result, dependencyEdges: buildEffectiveDependencyGraph(p, resourceEdges).edges };
}

export function scheduleProject(input: Project): Map<string, Scheduled> {
  return scheduleProjectPlan(input).schedule;
}

/** Reparent atomically; the first child takes over every dependency edge of a leaf parent. */
export function setTaskParent(project: Project, uid: string, parentUid: string | null): Project {
  const task = project.tasks.find(value => value.uid === uid);
  const parent = project.tasks.find(value => value.uid === parentUid);
  if (!task || (parentUid !== null && !parent)) throw new Error('任务或父任务不存在');
  if (uid === parentUid) throw new Error('不能将任务设为自身的父任务');
  if (task.parent_uid === parentUid) return project;
  const firstChild = parent !== undefined && !project.tasks.some(value => value.parent_uid === parentUid);
  const inherited = firstChild ? parent.dependencies : [];
  const hasDependents = firstChild && project.tasks.some(value => value.dependencies.includes(parentUid!));
  if ((inherited.length || hasDependents) && project.tasks.some(value => value.parent_uid === uid)) {
    throw new Error('接收任务已有子任务，不能承接前置依赖或被依赖关系；请选择叶子任务');
  }
  const next = { ...project, tasks: project.tasks.map(value => {
    let dependencies = value.dependencies;
    if (firstChild) {
      if (value.uid === parentUid) dependencies = [];
      else {
        const combined = value.uid === uid ? [...dependencies, ...inherited] : dependencies;
        dependencies = [...new Set(combined.map(dependency => dependency === parentUid ? uid : dependency))];
      }
    }
    return value.uid === uid ? { ...value, parent_uid: parentUid, dependencies }
      : dependencies !== value.dependencies ? { ...value, dependencies } : value;
  }) };
  // Validate before tree traversal: invalid parent cycles must never drop tasks.
  return normalizeTreeOrder(validateProject(next));
}

export function moveTask(project: Project, uid: string, targetOrder: number): Project {
  const ordered = [...project.tasks].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex(t => t.uid === uid);
  if (index < 0) throw new Error('任务不存在');
  const [task] = ordered.splice(index, 1);
  ordered.splice(Math.max(0, Math.min(ordered.length, targetOrder - 1)), 0, task);
  return normalizeTreeOrder({ ...project, tasks: ordered.map((t, i) => ({ ...t, order: i + 1 })) });
}

/** Move a task (and its subtree) before a sibling without changing its parent. */
export function moveSiblingTask(project: Project, uid: string, targetUid: string): Project {
  const task = project.tasks.find(value => value.uid === uid), target = project.tasks.find(value => value.uid === targetUid);
  if (!task || !target) throw new Error('任务不存在');
  if (task.uid === target.uid) return project;
  if (task.parent_uid !== target.parent_uid) throw new Error('只能在同一层级的任务之间排序');
  const siblings = project.tasks.filter(value => value.parent_uid === task.parent_uid).sort((a, b) => a.order - b.order);
  const from = siblings.findIndex(value => value.uid === uid);
  siblings.splice(from, 1); siblings.splice(siblings.findIndex(value => value.uid === targetUid), 0, task);
  const order = new Map(siblings.map((value, index) => [value.uid, index + 1]));
  return normalizeTreeOrder({ ...project, tasks: project.tasks.map(value => order.has(value.uid) ? { ...value, order: order.get(value.uid)! } : value) });
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
