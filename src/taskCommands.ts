import { validateProject, type Project, type Task, type TaskDefaults } from './model';
import { setTaskParent } from './taskTree';

export function replaceTask(project: Project, updated: Task): Project {
  return { ...project, tasks: project.tasks.map(task => task.uid === updated.uid ? updated : task) };
}

export function reparentTask(project: Project, uid: string, parentUid: string | null): { project: Project; message: string } {
  const parent = project.tasks.find(task => task.uid === parentUid);
  const firstChild = parent !== undefined && !project.tasks.some(task => task.parent_uid === parentUid);
  const migratesPrerequisites = firstChild && parent.dependencies.length > 0;
  const migratesDependents = firstChild && project.tasks.some(task => task.dependencies.includes(parentUid!));
  const next = setTaskParent(project, uid, parentUid);
  const migrated = migratesPrerequisites && migratesDependents ? '原父任务的前置依赖已迁移到此任务，被依赖关系也已同步迁移。'
    : migratesPrerequisites ? '原父任务的前置依赖已迁移到此任务。'
      : migratesDependents ? '原父任务的被依赖关系已迁移到此任务。' : '';
  const message = parentUid === null ? '已设为根任务。请保存并备份。' : `父任务已更新，父任务排期将自动汇总。${migrated}请保存并备份。`;
  return { project: next, message };
}

export function addTaskDependency(project: Project, from: string, to: string): Project {
  if (from === to) throw new Error('不能把任务自身设为前置任务。');
  if (project.tasks.find(task => task.uid === to)?.dependencies.includes(from)) throw new Error('该依赖已存在。');
  const next = { ...project, tasks: project.tasks.map(task => task.uid === to
    ? { ...task, dependencies: [...task.dependencies, from] } : task) };
  validateProject(next);
  return next;
}

export function createTask(project: Project, defaults: TaskDefaults, uid: string): { project: Project; task: Task } {
  const assignee = defaults.assignee ?? project.project.assignees[0] ?? '未指定';
  if (defaults.assignee && !project.project.assignees.includes(defaults.assignee)) {
    throw new Error(`默认任务模板的执行人不在当前项目名单中：${defaults.assignee}`);
  }
  const task: Task = { uid, order: project.tasks.length + 1, ...defaults, assignee, parent_uid: null, dependencies: [] };
  const assignees = project.project.assignees.length ? project.project.assignees : [assignee];
  return { task, project: { ...project, project: { ...project.project, assignees }, tasks: [...project.tasks, task] } };
}

export function deleteTask(project: Project, uid: string): Project {
  const dependents = project.tasks.filter(task => task.dependencies.includes(uid));
  const children = project.tasks.filter(task => task.parent_uid === uid);
  if (children.length) throw new Error(`不能删除：${children.map(task => task.name).join('、')} 仍是其子任务。请先将子任务设为根任务或重新指定父任务。`);
  if (dependents.length) throw new Error(`不能删除：${dependents.map(task => task.name).join('、')} 仍依赖此任务。请先解除依赖。`);
  return { ...project, tasks: project.tasks.filter(task => task.uid !== uid)
    .sort((a, b) => a.order - b.order).map((task, index) => ({ ...task, order: index + 1 })) };
}

export function toggleTaskCollapse(project: Project, uid: string): Project {
  if (!project.tasks.some(task => task.parent_uid === uid)) return project;
  return { ...project, tasks: project.tasks.map(task => task.uid === uid
    ? { ...task, collapse_children: !task.collapse_children } : task) };
}
