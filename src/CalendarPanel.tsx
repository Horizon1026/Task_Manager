import { useMemo, useState } from 'react';
import type { CalendarYear, Project } from './model';
import { dayNumber, dateString, makeCalendar } from './dateCalendar';
import { api } from './api';
import { SearchableSelect } from './SearchableSelect';

export function CalendarPanel({ project, onChange, onClose, notify }: { project: Project; onChange: (p: Project) => void; onClose: () => void; notify: (s: string) => void }) {
  const [month, setMonth] = useState(project.project.start_date.slice(0, 7));
  const [selected, setSelected] = useState(project.project.start_date);
  const [workday, setWorkday] = useState(true), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const calendar = useMemo(() => makeCalendar(project), [project]);
  const year = Number(month.slice(0, 4));
  const first = dayNumber(month + '-01');
  const firstWeekday = (new Date(month + '-01T00:00:00Z').getUTCDay() + 6) % 7;
  const records = project.calendar.years.find(y => y.year === year);
  const setDate = (date: string) => {
    setSelected(date); setWorkday(calendar(date).isWorkday);
    setNote(project.calendar.overrides.find(o => o.date === date)?.note || '');
  };
  async function update() {
    setBusy(true);
    try {
      const result = await api<CalendarYear>(`calendar?year=${year}`);
      onChange({ ...project, calendar: { ...project.calendar, years: [...project.calendar.years.filter(y => y.year !== year), result].sort((a, b) => a.year - b.year) } });
      notify(`${year} 年日历已获取。请保存并备份以写入 YAML。`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  function apply(remove: boolean) {
    const overrides = project.calendar.overrides.filter(o => o.date !== selected);
    if (!remove) overrides.push({ date: selected, is_workday: workday, note });
    overrides.sort((a, b) => a.date.localeCompare(b.date));
    onChange({ ...project, calendar: { ...project.calendar, overrides } }); notify(remove ? '已恢复基础日历，等待保存。' : '本地修正已应用到排期，等待保存。');
  }
  return <div className="modal-backdrop"><section className="modal calendar-modal" role="dialog" aria-modal="true" aria-label="本地日历">
    <div className="panel-heading"><div><span className="eyebrow">LOCAL CALENDAR</span><h2>本地日历</h2></div><button aria-label="关闭日历" onClick={onClose}>×</button></div>
    <p className="muted">中国大陆全国统一安排 · 本地修正优先 · 日历与任务一起保存</p>
    <div className="calendar-toolbar"><input aria-label="日历月份" type="month" min="1900-01" max="2199-12" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /><span className={`badge ${records ? 'good' : 'warning'}`}>{records ? `${year} 年已加载` : `${year} 年暂估 · 仅普通周末`}</span><button disabled={busy} onClick={update}>{busy ? '正在获取…' : `联网更新 ${year} 年`}</button></div>
    <div className="calendar-layout"><div><div className="calendar-week">{['一', '二', '三', '四', '五', '六', '日'].map(d => <span key={d}>周{d}</span>)}</div>
      <div className="calendar-grid">{Array.from({ length: 42 }, (_, i) => {
        const date = dateString(first - firstWeekday + i), info = calendar(date);
        return <button key={date} className={`calendar-day ${info.isWorkday ? 'workday' : 'restday'} ${date === selected ? 'selected' : ''} ${date.slice(0, 7) !== month ? 'outside' : ''}`} onClick={() => setDate(date)} aria-label={`${date} ${info.isWorkday ? '工作日' : '休息日'}`}><strong>{Number(date.slice(8))}</strong><span>{info.name}</span>{info.overridden && <i>修正</i>}</button>;
      })}</div></div>
      <div className="calendar-edit"><h3>{selected}</h3><p className="muted">当前：{calendar(selected).isWorkday ? '工作日' : '休息日'} · {calendar(selected).name}</p><label>修正为<SearchableSelect label="修正日期类型" value={workday ? 'work' : 'rest'} onChange={value => setWorkday(value === 'work')} options={[{ value: 'work', label: '工作日' }, { value: 'rest', label: '休息日' }]} /></label><label>备注<input aria-label="日历修正备注" value={note} onChange={e => setNote(e.target.value)} placeholder="例如：团队集中休息" /></label><button className="primary full-width" disabled={busy} onClick={() => apply(false)}>应用本地修正</button><button className="full-width" disabled={busy || !project.calendar.overrides.some(o => o.date === selected)} onClick={() => apply(true)}>恢复基础日历</button><p className="small muted">修正覆盖一整天的上午和下午。联网更新不会覆盖手动修正。</p></div>
    </div>
    <p className="small muted">{records ? `获取时间：${new Date(records.fetched_at).toLocaleString()} · 数据源：holiday-cn` : '尚未取得有效年度数据，相关任务会标记为暂估。'} 跨年排期请加载涉及年份；年底还应检查次年安排。</p>
  </section></div>;
}
