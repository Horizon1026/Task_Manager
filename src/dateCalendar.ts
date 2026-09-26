import type { Project, Task, HalfDay } from './model';

const DAY = 86_400_000;
export const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
export const dateString = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const toSlot = (m: HalfDay) => dayNumber(m.date) * 2 + (m.period === 'pm' ? 1 : 0);
export const fromSlot = (slot: number): HalfDay => ({ date: dateString(Math.floor(slot / 2)), period: slot % 2 === 0 ? 'am' : 'pm' });
export const formatSlot = (slot: number) => { const m = fromSlot(slot); return `${m.date} ${m.period === 'am' ? '上午' : '下午'}`; };
export const formatMoment = (m: HalfDay | null) => m ? `${m.date} ${m.period === 'am' ? '上午' : '下午'}` : '未设置';
export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function makeCalendar(project: Project) {
  const days = new Map<string, { isOffDay: boolean; name: string }>();
  // Later annual announcements take precedence at a year boundary.
  for (const year of [...project.calendar.years].sort((a, b) => a.year - b.year)) for (const d of year.days) days.set(d.date, d);
  const overrides = new Map(project.calendar.overrides.map(o => [o.date, o]));
  const years = new Set(project.calendar.years.map(y => y.year));
  return (date: string) => {
    const override = overrides.get(date), special = days.get(date);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    return {
      isWorkday: override ? override.is_workday : special ? !special.isOffDay : !weekend,
      name: override ? override.note || '本地修正' : special?.name || (weekend ? '周末' : '工作日'),
      overridden: !!override,
      known: !!override || !!special || years.has(Number(date.slice(0, 4))),
    };
  };
}
export type CalendarLookup = ReturnType<typeof makeCalendar>;
export const LIMIT_SLOT = dayNumber('2199-12-31') * 2 + 2;
export function nextWorkSlot(slot: number, task: Task, calendar: CalendarLookup): number {
  let value = slot;
  while (value < LIMIT_SLOT) {
    if (task.allow_rest_day_work || calendar(dateString(Math.floor(value / 2))).isWorkday) return value;
    value = (Math.floor(value / 2) + 1) * 2;
  }
  throw new Error('排期超出了支持范围（2199 年）');
}
export function durationBetween(start: number, end: number, task: Task, calendar: CalendarLookup) {
  let count = 0;
  for (let slot = start; slot < end; slot++) if (task.allow_rest_day_work || calendar(dateString(Math.floor(slot / 2))).isWorkday) count++;
  return count / 2;
}
