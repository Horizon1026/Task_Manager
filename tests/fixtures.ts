import type { Project, Task } from '../src/model';
export const task = (uid: string, changes: Partial<Task> = {}): Task => ({ uid, order: 1, name: uid, description: '', assignee: '', status: '未开始', earliest_start: null, latest_finish: null, duration_days: 0.5, dependencies: [], labels: [], allow_rest_day_work: false, ...changes });
export function project(tasks: Task[] = [task('a')]): Project {
  return { version: 1, project: { name: '测试项目', start_date: '2026-09-14', default_scale: 'week', default_filter: { labels: [], mode: 'or' } }, calendar: { years: [], overrides: [] }, tasks: tasks.map((t, i) => ({ ...t, order: i + 1 })) };
}
