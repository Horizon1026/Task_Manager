import { validateProject, type Project, type Task } from './model';

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
