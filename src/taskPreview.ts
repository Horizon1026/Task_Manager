import { taskSchema, type Project, type Task } from './model';

export function taskDisplayName(task: Pick<Task, 'name' | 'uid'>): string {
  return task.name.trim() ? task.name : task.uid;
}

/** A temporary empty title is display-only; saving still validates the original draft. */
export function projectForPreview(project: Project): Project {
  if (project.tasks.every(task => task.name.trim())) return project;
  // Only normalize missing titles for strict validation; display formatting cannot affect scheduling.
  return { ...project, tasks: project.tasks.map(task => task.name.trim() ? task : { ...task, name: task.uid }) };
}

export function durationFromInput(input: string, defaultDuration: number): number {
  const value = input.trim() ? Number(input) : NaN;
  return taskSchema.shape.duration_days.safeParse(value).success ? value : defaultDuration;
}
