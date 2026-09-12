import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Project, Scale, Task } from './model';
import { dayNumber, dateString, durationBetween, formatMoment, formatSlot, fromSlot, makeCalendar, nextWorkSlot, type Scheduled, todayLocal } from './schedule';
import { alignStart, pixelsPerDay, timeColumns } from './timeline';

type Drag = { uid: string; mode: 'move' | 'start' | 'end' | 'dependency'; x: number; y: number; dx: number; dy: number; moved: boolean };
export function Gantt({ project, schedule, scale, selected, filter, onSelect, onChange, onOrder, onDependency, notify }: {
  project: Project; schedule: Map<string, Scheduled>; scale: Scale; selected: string | null;
  filter: { labels: string[]; mode: 'and' | 'or' };
  onSelect: (uid: string) => void; onChange: (task: Task) => void; onOrder: (uid: string, order: number) => void;
  onDependency: (from: string, to: string) => void; notify: (message: string) => void;
}) {
  const tasks = [...project.tasks].sort((a, b) => a.order - b.order);
  const ppd = pixelsPerDay[scale], pps = ppd / 2;
  const calendar = useMemo(() => makeCalendar(project), [project]);
  const origin = alignStart(Math.min(dayNumber(project.project.start_date) - 2, ...[...schedule.values()].map(s => Math.floor(s.start / 2) - 2)), scale);
  const end = Math.max(origin + Math.ceil(1100 / ppd), ...[...schedule.values()].map(s => Math.ceil(s.end / 2) + 10));
  const width = Math.ceil((end - origin) * ppd);
  const columns = timeColumns(origin, end, scale);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), skipClick = useRef(false);
  const [hover, setHover] = useState<{ uid: string; x: number; y: number } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const x = (slot: number) => (slot - origin * 2) * pps;
  const matches = (task: Task) => filter.labels.length === 0 || (filter.mode === 'and' ? filter.labels.every(l => task.labels.includes(l)) : filter.labels.some(l => task.labels.includes(l)));
  function begin(e: ReactPointerEvent<HTMLElement>, task: Task, mode: Drag['mode']) {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation(); setHover(null);
    const actualMode = e.button === 2 ? 'dependency' : mode;
    const value: Drag = { uid: task.uid, mode: actualMode, x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false };
    dragRef.current = value; setDrag(value); e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moving(e: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const value = { ...d, dx: e.clientX - d.x, dy: e.clientY - d.y, moved: d.moved || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4 };
    dragRef.current = value; setDrag(value);
  }
  function finish(e: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current; if (!d) return;
    dragRef.current = null; setDrag(null); skipClick.current = d.moved || d.mode === 'dependency';
    if (!d.moved) return;
    const task = tasks.find(t => t.uid === d.uid)!, s = schedule.get(d.uid);
    if (!s) return;
    if (d.mode === 'dependency') {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-task-uid]')?.dataset.taskUid;
      if (target) onDependency(d.uid, target); else notify('已取消：请将箭头拖到目标任务上。');
      return;
    }
    const delta = Math.round(d.dx / pps);
    try {
      if (d.mode === 'end') {
        const endSlot = s.end + delta;
        if (endSlot <= s.start) return notify('预计耗时不能小于 0.5 天。');
        const duration = durationBetween(s.start, endSlot, task, calendar);
        if (duration < 0.5) return notify('预计耗时不能小于 0.5 天。');
        onChange({ ...task, duration_days: duration });
      } else {
        const candidate = s.start + delta;
        if (candidate < s.dependencyFloor) return notify('已阻止拖动：开始时间不能早于前置任务完成后的时段。');
        if (candidate < dayNumber('1900-01-01') * 2) return notify('日期超出支持范围。');
        onChange({ ...task, earliest_start: fromSlot(nextWorkSlot(candidate, task, calendar)) });
      }
    } catch (error) { notify((error as Error).message); }
  }
  function cancel() { dragRef.current = null; setDrag(null); skipClick.current = true; }
  const rowIndex = (uid: string) => tasks.findIndex(t => t.uid === uid);
  const hoverTask = hover && tasks.find(t => t.uid === hover.uid);
  const hoverSchedule = hoverTask && schedule.get(hoverTask.uid);
  return <div className="gantt-section">
    <div className="gantt-caption"><span>{dateString(origin)} — {dateString(end - 1)}</span><span>拖动调整排期 · 右键拖动添加依赖 · 点击任务编辑</span><button onClick={() => { if (scroll.current) scroll.current.scrollLeft = Math.max(0, (dayNumber(todayLocal()) - origin) * ppd - 100); }}>定位今天</button></div>
    <div className="gantt-scroll" ref={scroll} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} tabIndex={0}>
      <div className="gantt-canvas" style={{ width: width + 260 }}>
        <div className="gantt-header"><div className="task-heading">任务 / 执行人<span>{tasks.length} 条</span></div><div className="time-heading" style={{ width }}>{columns.map(c => <div key={c.start} style={{ left: (c.start - origin) * ppd, width: (c.end - c.start) * ppd }}>{c.label}{scale === 'day' && <small>上午　下午</small>}</div>)}</div></div>
        <div className="gantt-body" style={{ minHeight: 240 }}>
          <div className="time-background" style={{ left: 260, width, backgroundSize: `${ppd}px 100%` }}>
            {ppd >= 3 && end - origin <= 5000 && Array.from({ length: Math.ceil(end - origin) }, (_, i) => !calendar(dateString(origin + i)).isWorkday && <div className="rest-column" key={i} style={{ left: i * ppd, width: ppd }} />)}
            {columns.map(c => <div className="period-line" key={c.start} style={{ left: (c.start - origin) * ppd }} />)}
            <div className="today-line" style={{ left: (dayNumber(todayLocal()) - origin) * ppd }}><span>今天</span></div>
          </div>
          {tasks.map(task => {
            const s = schedule.get(task.uid), active = drag?.uid === task.uid && drag.mode !== 'dependency';
            const delta = active ? Math.round(drag.dx / pps) : 0;
            const blocked = !!s && active && drag.mode !== 'end' && s.start + delta < s.dependencyFloor;
            const left = s ? x(s.start) + (active && drag.mode !== 'end' ? delta * pps : 0) : 0;
            const barWidth = s ? Math.max(8, (s.end - s.start + (active && drag.mode === 'end' ? delta : 0)) * pps) : 0;
            return <div className={`gantt-row ${selected === task.uid ? 'selected-row' : ''} ${matches(task) ? '' : 'muted-row'}`} key={task.uid} data-task-uid={task.uid} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const uid = e.dataTransfer.getData('text/mission-uid'); if (uid) onOrder(uid, task.order); }}>
              <div className="task-cell"><span className="row-grip" draggable onDragStart={e => e.dataTransfer.setData('text/mission-uid', task.uid)} title="上下拖动调整排序">⠿</span><span className="row-number">{task.order.toString().padStart(2, '0')}</span><button className="task-title" onClick={() => onSelect(task.uid)}><strong>{task.name || '未命名任务'}</strong><small>{task.assignee || '未指定执行人'}{task.labels.length > 0 ? ` · ${task.labels.join(' / ')}` : ''}</small></button><div className="row-order"><button aria-label={`上移 ${task.name}`} disabled={task.order === 1} onClick={() => onOrder(task.uid, task.order - 1)}>↑</button><button aria-label={`下移 ${task.name}`} disabled={task.order === tasks.length} onClick={() => onOrder(task.uid, task.order + 1)}>↓</button></div></div>
              <div className="task-track" style={{ width }}>
                {s && <div role="button" tabIndex={0} aria-label={`任务条 ${task.name}`} data-testid={`bar-${task.uid}`} className={`task-bar status-${['未开始', '进行中', '验收中', '已完成'].indexOf(task.status)} ${s.late ? 'late' : ''} ${blocked ? 'blocked' : ''} ${active ? 'dragging' : ''}`} style={{ left, width: barWidth }} onContextMenu={e => e.preventDefault()} onPointerDown={e => begin(e, task, 'move')} onPointerMove={moving} onPointerUp={finish} onPointerCancel={cancel} onClick={() => { if (!skipClick.current) onSelect(task.uid); skipClick.current = false; }} onKeyDown={e => { if (e.key === 'Enter') onSelect(task.uid); if (e.key === 'Escape') cancel(); }} onMouseEnter={e => { if (!dragRef.current) setHover({ uid: task.uid, x: e.clientX, y: e.clientY }); }} onMouseLeave={() => setHover(null)}>
                  <span className="bar-handle left" aria-label="调整开始时间" onPointerDown={e => begin(e, task, 'start')} /><span className="bar-name">{task.name}</span><span className="bar-handle right" aria-label="调整预计耗时" onPointerDown={e => begin(e, task, 'end')} />
                </div>}
                {s?.late && <span className="deadline-mark" title={`截止：${formatMoment(task.latest_finish)}`} style={{ left: x(s.end) + 8 }}>!</span>}
              </div>
            </div>;
          })}
          {!tasks.length && <div className="empty">还没有任务。点击“新增任务”开始安排。</div>}
          <svg className="dependency-layer" width={width} height={Math.max(240, tasks.length * 62)} style={{ left: 260 }}><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="currentColor" /></marker></defs>{tasks.flatMap(task => task.dependencies.filter(dep => task.uid === selected || dep === selected).map(dep => {
            const a = schedule.get(dep), b = schedule.get(task.uid); if (!a || !b) return null;
            const ax = x(a.end), ay = rowIndex(dep) * 62 + 31, bx = x(b.start), by = rowIndex(task.uid) * 62 + 31;
            return <path key={`${dep}-${task.uid}`} d={`M${ax},${ay} C${ax + 22},${ay} ${bx - 22},${by} ${bx},${by}`} markerEnd="url(#arrow)" />;
          }))}</svg>
        </div>
      </div>
    </div>
    {drag?.mode === 'dependency' && <svg className="drag-arrow"><defs><marker id="drag-arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L9 4 L0 8" fill="#187b74" /></marker></defs><path d={`M${drag.x},${drag.y} L${drag.x + drag.dx},${drag.y + drag.dy}`} markerEnd="url(#drag-arrowhead)" /></svg>}
    {drag && drag.mode !== 'dependency' && <div className="drag-hint">按半天吸附 · {drag.mode === 'end' ? '调整预计耗时' : '保持预计耗时，调整开始时间'} · Esc 取消</div>}
    {hover && hoverTask && hoverSchedule && !drag && <div className="hover-card" style={{ left: Math.max(8, Math.min(hover.x + 14, window.innerWidth - 350)), top: Math.max(8, Math.min(hover.y + 18, window.innerHeight - 390)) }}><span className="eyebrow">TASK PREVIEW</span><h3>{hoverTask.name}</h3><p>{hoverTask.description || '暂无详情'}</p><dl><dt>UID / 排序</dt><dd>{hoverTask.uid} / {hoverTask.order}</dd><dt>执行人 / 状态</dt><dd>{hoverTask.assignee || '未指定'} / {hoverTask.status}</dd><dt>最早开始</dt><dd>{hoverTask.earliest_start ? formatMoment(hoverTask.earliest_start) : `项目开始日 ${project.project.start_date}`}</dd><dt>最迟完成</dt><dd>{formatMoment(hoverTask.latest_finish)}</dd><dt>预计耗时</dt><dd>{hoverTask.duration_days} 天</dd><dt>休息日工作</dt><dd>{hoverTask.allow_rest_day_work ? '允许' : '不允许'}</dd><dt>前置依赖</dt><dd>{hoverTask.dependencies.map(uid => project.tasks.find(t => t.uid === uid)?.name).join('、') || '无'}</dd><dt>标签</dt><dd>{hoverTask.labels.join('、') || '无'}</dd><dt>计算开始</dt><dd>{formatSlot(hoverSchedule.start)}</dd><dt>计算完成</dt><dd>{formatSlot(hoverSchedule.end - 1)}</dd></dl><small>点击任务条固定详情并编辑</small></div>}
  </div>;
}
