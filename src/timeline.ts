import { dayNumber, dateString } from './dateCalendar';
import type { Scale } from './model';
export const pixelsPerDay: Record<Scale, number> = { day: 72, week: 22, 'half-month': 12, month: 7, quarter: 2.6, 'half-year': 1.4, year: 0.75 };
export function timeColumns(startDay: number, endDay: number, scale: Scale) {
  const columns: { start: number; end: number; label: string }[] = [];
  let cursor = startDay;
  while (cursor < endDay) {
    const d = new Date(dateString(cursor) + 'T00:00:00Z');
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    let next: number, label: string;
    if (scale === 'day') { next = cursor + 1; label = `${m + 1}/${day}`; }
    else if (scale === 'week') { next = cursor + (8 - (d.getUTCDay() || 7)); label = `${m + 1}/${day} 起`; }
    else if (scale === 'half-month') { next = Date.UTC(y, m + (day > 15 ? 1 : 0), day > 15 ? 1 : 16) / 86400000; label = `${y}/${m + 1} ${day > 15 ? '下' : '上'}`; }
    else {
      const step = scale === 'month' ? 1 : scale === 'quarter' ? 3 : scale === 'half-year' ? 6 : 12;
      next = Date.UTC(y, Math.floor(m / step) * step + step, 1) / 86400000;
      label = scale === 'month' ? `${y}/${m + 1}` : scale === 'quarter' ? `${y} Q${Math.floor(m / 3) + 1}` : scale === 'half-year' ? `${y} ${m < 6 ? '上半年' : '下半年'}` : `${y}年`;
    }
    columns.push({ start: cursor, end: Math.min(next, endDay), label }); cursor = next;
  }
  return columns;
}
export function alignStart(day: number, scale: Scale) {
  const d = new Date(dateString(day) + 'T00:00:00Z');
  if (scale === 'day') return day;
  if (scale === 'week') return day - ((d.getUTCDay() + 6) % 7);
  if (scale === 'half-month') return dayNumber(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCDate() > 15 ? '16' : '01'}`);
  const step = scale === 'month' ? 1 : scale === 'quarter' ? 3 : scale === 'half-year' ? 6 : 12;
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / step) * step, 1) / 86400000;
}
