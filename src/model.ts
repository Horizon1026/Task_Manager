import { z } from 'zod';

export const scales = ['day', 'week', 'half-month', 'month', 'quarter', 'half-year', 'year'] as const;
export const scaleNames = ['天', '周', '半月', '月', '季度', '半年', '年'];
export const statuses = ['未开始', '进行中', '验收中', '已完成'] as const;
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
  dependencies: z.array(z.string()).max(5000), labels: z.array(z.string().min(1).max(100)).max(100),
  allow_rest_day_work: z.boolean(),
}).strict();
const holiday = z.object({ date, name: z.string(), isOffDay: z.boolean() }).strict();
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

export function validateProject(input: unknown): Project {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
  const p = parsed.data;
  const map = new Map(p.tasks.map(t => [t.uid, t]));
  if (map.size !== p.tasks.length) throw new Error('任务 UID 重复');
  const orders = p.tasks.map(t => t.order).sort((a, b) => a - b);
  if (orders.some((n, i) => n !== i + 1)) throw new Error('任务排序 ID 必须是从 1 开始的连续整数');
  if (new Set(p.calendar.years.map(y => y.year)).size !== p.calendar.years.length) throw new Error('日历年份重复');
  if (new Set(p.calendar.overrides.map(o => o.date)).size !== p.calendar.overrides.length) throw new Error('日历修正日期重复');
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
