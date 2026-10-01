import { validateProject, type Project, type Task } from './model';
import { buildEffectiveDependencyGraph, type EffectiveDependencyEdge } from './effectiveDependencies';
import { dateString, makeCalendar, nextWorkSlot, toSlot, LIMIT_SLOT } from './dateCalendar';

export type Scheduled = { start: number; end: number; workEnd?: number; dependencyFloor: number; late: boolean; unknownYears: number[] };
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
  const untilStarts = new Map(leaves.map(task => [task.uid, [] as string[]]));
  for (const task of leaves) for (const dependency of task.dependencies) if (leafUids.has(dependency)) {
    successors.get(dependency)!.push(task.uid);
    indegree.set(task.uid, indegree.get(task.uid)! + 1);
  }
  for (const task of leaves) for (const target of task.until ?? []) {
    successors.get(task.uid)!.push(target);
    indegree.set(target, indegree.get(target)! + 1);
    untilStarts.get(target)!.push(task.uid);
  }
  const result = new Map<string, Scheduled>();
  const assigneeEnd = new Map<string, number>(), assigneePrevious = new Map<string, string>();
  const resourceEdges: EffectiveDependencyEdge[] = [];
  const scheduledOrder: Task[] = [];
  const explicitPairs = new Set(p.tasks.flatMap(task => task.dependencies.map(dependency => `${dependency}\0${task.uid}`)));

  function candidate(task: Task) {
    const explicitFloor = task.dependencies.reduce((latest, dependency) => Math.max(latest, result.get(dependency)!.end), -Infinity);
    const resourceFloor = p.project.allow_assignee_parallel_tasks ? -Infinity : (assigneeEnd.get(task.assignee) ?? -Infinity);
    const dependencyFloor = Math.max(explicitFloor, resourceFloor, ...(untilStarts.get(task.uid) ?? []).map(uid => result.get(uid)!.start));
    const earliest = toSlot(task.earliest_start ?? { date: p.project.start_date, period: 'am' });
    const constraint = Math.max(earliest, dependencyFloor);
    const start = nextWorkSlot(constraint, task, calendar);
    return { task, dependencyFloor, constraint, start };
  }
  function finish({ task, dependencyFloor, constraint, start }: ReturnType<typeof candidate>, untilFloor = -Infinity): Scheduled {
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
    const end = Math.max(cursor, untilFloor);
    const value: Scheduled = { start, end, workEnd: cursor, dependencyFloor,
      late: task.latest_finish !== null && end > toSlot(task.latest_finish) + 1,
      unknownYears: [...unknownYears].sort(),
    };
    return value;
  }

  const ready = leaves.filter(task => indegree.get(task.uid) === 0);
  while (ready.length) {
    const reservations = new Map<string, Set<string>>();
    if (!p.project.allow_assignee_parallel_tasks) for (const scheduled of scheduledOrder) for (const target of scheduled.until ?? []) {
      if (result.has(target)) continue;
      const targetTask = tasks.get(target)!;
      if (targetTask.assignee !== scheduled.assignee) continue;
      const group = reservations.get(scheduled.assignee) ?? new Set<string>();
      group.add(target); reservations.set(scheduled.assignee, group);
    }
    const eligible = ready.filter(task => !reservations.has(task.assignee) || reservations.get(task.assignee)!.has(task.uid));
    if (!eligible.length) throw new Error('until 关系与同执行人串行约束冲突，目标任务无法紧接占用任务开始。');
    const candidates = eligible.map(candidate).sort((left, right) => left.start - right.start || left.task.order - right.task.order || (left.task.uid < right.task.uid ? -1 : left.task.uid > right.task.uid ? 1 : 0));
    const selected = candidates[0];
    ready.splice(ready.findIndex(task => task.uid === selected.task.uid), 1);
    const value = finish(selected);
    result.set(selected.task.uid, value);
    scheduledOrder.push(selected.task);
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
  if (result.size !== leaves.length) throw new Error('前置依赖或 until 关系形成循环，无法完成排程。');

  // The original list order fixes resource precedence. Propagate until endpoints
  // through that precedence and explicit finish-start edges until times stabilize.
  // A positive cycle (for example A until B, A -> C -> B) has no finite schedule.
  if (leaves.some(task => task.until?.length)) {
    let previous = new Map(result);
    let stable = false;
    for (let pass = 0; pass <= leaves.length + 1; pass++) {
      result.clear(); assigneeEnd.clear();
      for (const task of scheduledOrder) {
        const targetStarts = (task.until ?? []).map(uid => previous.get(uid)!.start);
        const value = finish(candidate(task), Math.max(-Infinity, ...targetStarts));
        result.set(task.uid, value);
        if (!p.project.allow_assignee_parallel_tasks) assigneeEnd.set(task.assignee, value.end);
      }
      stable = scheduledOrder.every(task => {
        const before = previous.get(task.uid)!, after = result.get(task.uid)!;
        return before.start === after.start && before.end === after.end;
      });
      if (stable) break;
      previous = new Map(result);
    }
    if (!stable) throw new Error('until 关系与前置依赖或执行人串行约束冲突，无法排出有限时间。');
    for (const task of leaves) for (const target of task.until ?? []) {
      if (result.get(task.uid)!.start > result.get(target)!.start) throw new Error(`任务「${task.name}」开始晚于 until 目标任务，无法持续到其开始。`);
    }
  }

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
