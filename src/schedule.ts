import { validateProject, type Project, type Task } from './model';
import { buildEffectiveDependencyGraph, type EffectiveDependencyEdge } from './effectiveDependencies';
import { dateString, makeCalendar, nextWorkSlot, toSlot, LIMIT_SLOT } from './dateCalendar';

export type Scheduled = { start: number; end: number; dependencyFloor: number; late: boolean; unknownYears: number[] };
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
