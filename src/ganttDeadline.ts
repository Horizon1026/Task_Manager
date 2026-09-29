import { momentSchema, type Project } from './model';
import { toSlot } from './dateCalendar';

/** latest_finish is inclusive: mark the end of that half-day, as lateness does. */
export function selectedTaskDeadline(project: Pick<Project, 'tasks'>, selected: string | null, displayed: ReadonlySet<string>) {
  const task = project.tasks.find(task => task.uid === selected);
  if (!task || !displayed.has(task.uid) || project.tasks.some(child => child.parent_uid === task.uid)) return null;
  const deadline = momentSchema.safeParse(task.latest_finish);
  return deadline.success ? { task, moment: deadline.data, slot: toSlot(deadline.data) + 1 } : null;
}
