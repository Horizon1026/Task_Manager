import type { Project } from './model';
import type { Scheduled } from './schedule';

/** Return every leaf task overlapping at least one task of the same assignee,
 * not pairs or groups whose members must all overlap one another.
 * Timeline intervals are half-open; parent summaries are not additional work.
 */
export function parallelTaskUids(project: Pick<Project, 'tasks'>, schedule: ReadonlyMap<string, Scheduled>): Set<string> {
  const parents = new Set(project.tasks.map(task => task.parent_uid));
  const groups = new Map<string, { uid: string; start: number; end: number }[]>();
  for (const task of project.tasks) {
    const time = schedule.get(task.uid);
    if (!time || parents.has(task.uid) || !task.assignee.trim() || task.assignee === '未指定') continue;
    const group = groups.get(task.assignee) ?? [];
    group.push({ uid: task.uid, start: time.start, end: time.end });
    groups.set(task.assignee, group);
  }
  const conflicts = new Set<string>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.start - b.start || a.end - b.end);
    let longest: typeof group[number] | undefined;
    for (const current of group) {
      if (longest && current.start < longest.end) {
        conflicts.add(longest.uid); conflicts.add(current.uid);
      }
      if (!longest || current.end > longest.end) longest = current;
    }
  }
  return conflicts;
}
