import { z } from 'zod';

export const scales = ['day', 'week', 'half-month', 'month', 'quarter', 'half-year', 'year'] as const;
export const scaleNames = ['天', '周', '半月', '月', '季度', '半年', '年'];
export const statuses = ['未开始', '进行中', '验收中', '已完成'] as const;
export const defaultStatusColors = {
  '未开始': { fill: '#dfe9e2', border: '#c8d8cb', text: '#647c69' },
  '进行中': { fill: '#bce0d5', border: '#92c7b7', text: '#2a7361' },
  '验收中': { fill: '#e5ddf4', border: '#d0bfe7', text: '#8264a3' },
  '已完成': { fill: '#d4e3f5', border: '#b9cfe9', text: '#567ba2' },
} as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const time = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === s && s >= '1900-01-01' && s <= '2199-12-31';
}, '日期须为 1900—2199 年的有效日期');
export const momentSchema = z.object({ date, period: z.enum(['am', 'pm']) }).strict();
export const taskSchema = z.object({
  uid: z.string().min(1).max(100), order: z.number().int().positive(),
  name: z.string().trim().min(1, '任务名称不能为空').max(200),
  description: z.string().max(20000), assignee: z.string().max(200),
  status: z.enum(statuses),
  earliest_start: momentSchema.nullable(), latest_finish: momentSchema.nullable(),
  duration_days: z.number().min(0.5).max(36500).multipleOf(0.5),
  // Optional on input for backward-compatible loading of existing project snapshots.
  parent_uid: z.string().min(1).max(100).nullable().default(null),
  collapse_children: z.boolean().default(false),
  dependencies: z.array(z.string()).max(5000), labels: z.array(z.string().min(1).max(100)).max(100),
  allow_rest_day_work: z.boolean(),
}).strict();
const holiday = z.object({ date, name: z.string(), isOffDay: z.boolean() }).strict();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须为 #RRGGBB 格式');
const statusColor = z.object({ fill: color, border: color, text: color }).strict();
const statusColors = z.object({
  '未开始': statusColor, '进行中': statusColor, '验收中': statusColor, '已完成': statusColor,
}).strict().default(defaultStatusColors);
export const yearSchema = z.object({
  year: z.number().int().min(1900).max(2199),
  source: z.string(), fetched_at: z.string(), papers: z.array(z.string()),
  days: z.array(holiday),
}).strict().superRefine((data, ctx) => {
  if (!data.days.length || !data.papers.length) ctx.addIssue({ code: 'custom', message: '年度日历尚未发布有效数据' });
  if (new Set(data.days.map(d => d.date)).size !== data.days.length) ctx.addIssue({ code: 'custom', message: '年度日历日期重复' });
  if (data.days.some(d => Math.abs(Number(d.date.slice(0, 4)) - data.year) > 1)) ctx.addIssue({ code: 'custom', message: '日历包含不相关年份' });
});
export const projectSchema = z.object({
  version: z.literal(1),
  project: z.object({
    name: z.string().trim().min(1).max(200), start_date: date,
    default_scale: z.enum(scales),
    default_filter: z.object({ labels: z.array(z.string()), mode: z.enum(['and', 'or']) }).strict(),
    assignees: z.array(z.string().trim().min(1).max(200)).max(1000).default([]),
    status_colors: statusColors,
  }).strict(),
  calendar: z.object({
    years: z.array(yearSchema),
    overrides: z.array(z.object({ date, is_workday: z.boolean(), note: z.string().max(1000) }).strict()),
  }).strict(),
  tasks: z.array(taskSchema).max(5000),
}).strict();
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type HalfDay = z.infer<typeof momentSchema>;
export type CalendarYear = z.infer<typeof yearSchema>;
export type Scale = typeof scales[number];

export function descendantUids(project: Project, uid: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const task of project.tasks) if (task.parent_uid !== null) {
    const value = children.get(task.parent_uid) ?? [];
    value.push(task.uid); children.set(task.parent_uid, value);
  }
  const result = new Set<string>(), pending = [...(children.get(uid) ?? [])];
  while (pending.length) {
    const child = pending.pop()!;
    if (result.has(child)) continue;
    result.add(child); pending.push(...(children.get(child) ?? []));
  }
  return result;
}

export function validateProject(input: unknown): Project {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
  const p = parsed.data;
  if (!p.project.assignees.length) p.project.assignees = [...new Set(p.tasks.map(task => task.assignee || '未指定'))].sort();
  for (const task of p.tasks) {
    if (!task.assignee) task.assignee = '未指定';
    if (!p.project.assignees.includes(task.assignee)) throw new Error(`任务「${task.name}」的执行人不在项目名单中：${task.assignee}`);
  }
  const map = new Map(p.tasks.map(t => [t.uid, t]));
  if (map.size !== p.tasks.length) throw new Error('任务 UID 重复');
  const orders = p.tasks.map(t => t.order).sort((a, b) => a - b);
  if (orders.some((n, i) => n !== i + 1)) throw new Error('任务排序 ID 必须是从 1 开始的连续整数');
  if (new Set(p.calendar.years.map(y => y.year)).size !== p.calendar.years.length) throw new Error('日历年份重复');
  if (new Set(p.calendar.overrides.map(o => o.date)).size !== p.calendar.overrides.length) throw new Error('日历修正日期重复');
  const children = new Set(p.tasks.flatMap(t => t.parent_uid ? [t.parent_uid] : []));
  for (const task of p.tasks) {
    if (task.parent_uid === null) continue;
    if (task.parent_uid === task.uid) throw new Error(`任务「${task.name}」不能作为自身的父任务`);
    if (!map.has(task.parent_uid)) throw new Error(`任务「${task.name}」的父任务不存在：${task.parent_uid}`);
  }
  for (const task of p.tasks) {
    const seen = new Set<string>([task.uid]);
    let parent = task.parent_uid;
    while (parent !== null) {
      if (seen.has(parent)) throw new Error(`存在循环父子关系：${task.name}`);
      seen.add(parent); parent = map.get(parent)!.parent_uid;
    }
    if (children.has(task.uid) && task.dependencies.length) throw new Error(`父任务「${task.name}」不能设置前置依赖；请为叶子任务设置依赖`);
    for (const dependency of task.dependencies) if (children.has(dependency)) throw new Error(`任务「${task.name}」不能依赖父任务：${dependency}`);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(uid: string) {
    if (visiting.has(uid)) throw new Error(`存在循环依赖：${map.get(uid)?.name}`);
    if (visited.has(uid)) return;
    const task = map.get(uid);
    if (!task) throw new Error(`依赖任务不存在：${uid}`);
    visiting.add(uid);
    if (new Set(task.dependencies).size !== task.dependencies.length) throw new Error(`任务「${task.name}」存在重复依赖`);
    for (const dep of task.dependencies) visit(dep);
    visiting.delete(uid); visited.add(uid);
  }
  for (const t of p.tasks) visit(t.uid);
  return p;
}
