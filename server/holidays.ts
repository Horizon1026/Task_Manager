import { yearSchema, type CalendarYear } from '../src/model';
import { HttpError } from './store';

export async function downloadYear(year: number): Promise<CalendarYear> {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) throw new HttpError(400, '无效年份');
  const sources = [
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  ];
  const errors: string[] = [];
  for (const source of sources) {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.text();
      if (content.length > 2_000_000) throw new Error('年度数据过大');
      const data = JSON.parse(content);
      if (data.year !== year) throw new Error('返回数据的年份不匹配');
      return yearSchema.parse({ year, source, fetched_at: new Date().toISOString(), papers: data.papers, days: data.days });
    } catch (error) { errors.push((error as Error).message); }
  }
  throw new HttpError(502, `未取得 ${year} 年的有效日历。已有日历保持不变。可能尚未公布或网络不可用。${errors.join('；')}`);
}
