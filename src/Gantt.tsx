import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { type Project, type Scale, type Task } from './model';
import { dayNumber, dateString, durationBetween, formatMoment, formatSlot, fromSlot, makeCalendar, nextWorkSlot, type Scheduled, todayLocal } from './schedule';
import { alignStart, pixelsPerDay, timeColumns } from './timeline';
import { ganttTreeLayout } from './ganttLayout';
import './tree.css';
import './ganttOverrides.css';

type Drag = { uid: string; mode: 'move' | 'start' | 'end' | 'dependency'; x: number; y: number; dx: number; dy: number; moved: boolean };
type Props = { project: Project; schedule: Map<string, Scheduled>; scale: Scale; selected: string | null; filter: { labels: string[]; mode: 'and' | 'or' }; onSelect: (uid: string | null) => void; onChange: (task: Task) => void; onOrder: (uid: string, order: number) => void; onSiblingOrder: (uid: string, targetUid: string) => void; onDependency: (from: string, to: string) => void; notify: (message: string) => void };

export function Gantt({ project, schedule, scale, selected, filter, onSelect, onChange, onOrder, onSiblingOrder, onDependency, notify }: Props) {
  const allTasks = [...project.tasks].sort((a, b) => a.order - b.order);
  const matches = (task: Task) => !filter.labels.length || (filter.mode === 'and' ? filter.labels.every(label => task.labels.includes(label)) : filter.labels.some(label => task.labels.includes(label)));
  const visibleUids = useMemo(() => {
    if (!filter.labels.length) return new Set(allTasks.map(task => task.uid));
    const result = new Set(allTasks.filter(matches).map(task => task.uid));
    const parents = new Map(allTasks.map(task => [task.uid, task.parent_uid]));
    for (const task of allTasks.filter(matches)) {
      let parent = task.parent_uid;
      while (parent !== null) { result.add(parent); parent = parents.get(parent) ?? null; }
    }
    return result;
  }, [allTasks, filter]);
  const tasks = allTasks.filter(task => visibleUids.has(task.uid));
  const visibleProject = useMemo(() => ({ ...project, tasks }), [project, tasks]);
  const layout = useMemo(() => ganttTreeLayout(visibleProject), [visibleProject]);
  const byUid = useMemo(() => new Map(layout.items.map(item => [item.task.uid, item])), [layout]);
  const ppd = pixelsPerDay[scale], pps = ppd / 2, calendar = useMemo(() => makeCalendar(project), [project]);
  const origin = alignStart(Math.min(dayNumber(project.project.start_date) - 2, ...[...schedule.values()].map(value => Math.floor(value.start / 2) - 2)), scale);
  const end = Math.max(origin + Math.ceil(1100 / ppd), ...[...schedule.values()].map(value => Math.ceil(value.end / 2) + 10));
  const width = Math.ceil((end - origin) * ppd), columns = timeColumns(origin, end, scale), height = Math.max(240, layout.height);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [taskListWidth, setTaskListWidth] = useState(260);
  const [scrollLeft, setScrollLeft] = useState(0);
  const dragRef = useRef<Drag | null>(null), resizeRef = useRef<{ x: number; width: number } | null>(null), panRef = useRef<{ x: number; scrollLeft: number; moved: boolean } | null>(null), skipClick = useRef(false), scroll = useRef<HTMLDivElement>(null);
  const x = (slot: number) => (slot - origin * 2) * pps;
  const isParent = (task: Task) => project.tasks.some(value => value.parent_uid === task.uid);
  function begin(e: ReactPointerEvent<HTMLElement>, task: Task, mode: Drag['mode']) {
    if (e.button !== 0 && e.button !== 2) return;
    if (isParent(task)) return;
    e.preventDefault(); e.stopPropagation();
    const value: Drag = { uid: task.uid, mode: e.button === 2 ? 'dependency' : mode, x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false };
    dragRef.current = value; setDrag(value); e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moving(e: ReactPointerEvent<HTMLElement>) { if (!dragRef.current) return; const value = { ...dragRef.current, dx: e.clientX - dragRef.current.x, dy: e.clientY - dragRef.current.y, moved: dragRef.current.moved || Math.abs(e.clientX - dragRef.current.x) + Math.abs(e.clientY - dragRef.current.y) > 4 }; dragRef.current = value; setDrag(value); }
  function finish(e: ReactPointerEvent<HTMLElement>) {
    const value = dragRef.current; if (!value) return; dragRef.current = null; setDrag(null); skipClick.current = value.moved || value.mode === 'dependency'; if (!value.moved) return;
    const task = tasks.find(item => item.uid === value.uid)!, scheduled = schedule.get(value.uid); if (!scheduled) return;
    if (value.mode === 'dependency') { const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-task-uid]')?.dataset.taskUid; if (target) onDependency(value.uid, target); else notify('已取消：请将箭头拖到目标任务上。'); return; }
    const delta = Math.round(value.dx / pps);
    try {
      if (value.mode === 'end') { const endSlot = scheduled.end + delta; if (endSlot <= scheduled.start) return notify('预计耗时不能小于 0.5 天。'); const duration = durationBetween(scheduled.start, endSlot, task, calendar); if (duration < 0.5) return notify('预计耗时不能小于 0.5 天。'); onChange({ ...task, duration_days: duration }); }
      else { const candidate = scheduled.start + delta; if (candidate < scheduled.dependencyFloor) return notify('已阻止拖动：开始时间不能早于前置任务完成后的时段。'); if (candidate < dayNumber('1900-01-01') * 2) return notify('日期超出支持范围。'); onChange({ ...task, earliest_start: fromSlot(nextWorkSlot(candidate, task, calendar)) }); }
    } catch (error) { notify((error as Error).message); }
  }
  function cancel() { dragRef.current = null; setDrag(null); skipClick.current = true; }
  function beginListResize(e: ReactPointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    resizeRef.current = { x: e.clientX, width: taskListWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function resizeList(e: ReactPointerEvent<HTMLSpanElement>) {
    const start = resizeRef.current;
    if (start) setTaskListWidth(Math.max(190, Math.min(520, start.width + e.clientX - start.x)));
  }
  function finishListResize(e: ReactPointerEvent<HTMLSpanElement>) {
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function beginPan(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement, taskTarget = target.closest<HTMLElement>('[data-task-uid]');
    if (e.button !== 0 || target.closest('button, .task-list-resize-handle, .tree-task-labels') || (taskTarget && !taskTarget.classList.contains('parent-task-bar'))) return;
    panRef.current = { x: e.clientX, scrollLeft: e.currentTarget.scrollLeft, moved: false };
    onSelect(null); e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  }
  function beginParentPan(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !scroll.current) return;
    panRef.current = { x: e.clientX, scrollLeft: scroll.current.scrollLeft, moved: false };
    onSelect(null); scroll.current.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault();
  }
  function pan(e: ReactPointerEvent<HTMLDivElement>) {
    const start = panRef.current;
    if (start && scroll.current) {
      if (Math.abs(e.clientX - start.x) > 4) { start.moved = true; skipClick.current = true; }
      scroll.current.scrollLeft = start.scrollLeft - (e.clientX - start.x);
    }
  }
  function finishPan(e: ReactPointerEvent<HTMLDivElement>) {
    panRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <div className="gantt-section">
    <div className="gantt-caption"><span>{dateString(origin)} — {dateString(end - 1)}</span><span>拖动叶子任务调整排期 · 右键拖动添加依赖 · 点击任务编辑</span><button onClick={() => { if (scroll.current) scroll.current.scrollLeft = Math.max(0, (dayNumber(todayLocal()) - origin) * ppd - 100); }}>定位今天</button></div>
    <div className="gantt-scroll" ref={scroll} onPointerDown={beginPan} onPointerMove={pan} onPointerUp={finishPan} onPointerCancel={finishPan} onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} tabIndex={0}><div className="gantt-canvas" style={{ width: width + taskListWidth }}>
      <div className="gantt-header"><div className="task-heading" style={{ width: taskListWidth, minWidth: taskListWidth }}>任务 / 执行人<span>{tasks.length} 条</span><span role="separator" aria-label="调整任务列表宽度" aria-orientation="vertical" className="task-list-resize-handle" onPointerDown={beginListResize} onPointerMove={resizeList} onPointerUp={finishListResize} onPointerCancel={finishListResize} /></div><div className="time-heading" style={{ width }}>{columns.map(column => <div key={column.start} style={{ left: (column.start - origin) * ppd, width: (column.end - column.start) * ppd }}>{column.label}{scale === 'day' && <small>上午　下午</small>}</div>)}</div></div>
      <div className="gantt-body tree-gantt-body" style={{ minHeight: height }}>
        <div className="time-background" style={{ left: taskListWidth, width, backgroundSize: `${ppd}px 100%` }}>{ppd >= 3 && end - origin <= 5000 && Array.from({ length: Math.ceil(end - origin) }, (_, index) => !calendar(dateString(origin + index)).isWorkday && <div className="rest-column" key={index} style={{ left: index * ppd, width: ppd }} />)}{columns.map(column => <div className="period-line" key={column.start} style={{ left: (column.start - origin) * ppd }} />)}<div className="today-line" style={{ left: (dayNumber(todayLocal()) - origin) * ppd }}><span>今天</span></div></div>
        <div className="tree-task-labels" style={{ width: taskListWidth, transform: `translateX(${scrollLeft}px)` }}>{layout.items.map(item => <TaskLabel key={item.task.uid} item={item} isParent={isParent(item.task)} listWidth={taskListWidth} selected={selected} dimmed={false} total={allTasks.length} onSelect={onSelect} onOrder={onOrder} onSiblingOrder={onSiblingOrder} />)}</div>
        <div className="tree-task-tracks" style={{ left: taskListWidth, width }}>{layout.items.map(item => {
          const task = item.task, scheduled = schedule.get(task.uid), active = drag?.uid === task.uid && drag.mode !== 'dependency', delta = active ? Math.round(drag.dx / pps) : 0;
          const left = scheduled ? x(scheduled.start) + (active && drag.mode !== 'end' ? delta * pps : 0) : 0, barWidth = scheduled ? Math.max(8, (scheduled.end - scheduled.start + (active && drag.mode === 'end' ? delta : 0)) * pps) : 0;
          const blocked = !!scheduled && active && drag.mode !== 'end' && scheduled.start + delta < scheduled.dependencyFloor;
          const parent = isParent(task), color = project.project.status_colors[task.status];
          const statusStyle = parent ? { borderColor: color.border, color: color.text } : { backgroundColor: color.fill, borderColor: color.border, color: color.text };
          return scheduled && <div role="button" tabIndex={0} key={task.uid} data-task-uid={task.uid} data-testid={`bar-${task.uid}`} aria-label={`任务条 ${task.name}`} className={`task-bar ${parent ? 'parent-task-bar' : 'child-task-bar'} ${scheduled.late ? 'late' : ''} ${blocked ? 'blocked' : ''} ${active ? 'dragging' : ''}`} style={{ left, width: barWidth, top: item.top + (parent ? 4 : 6), height: parent ? Math.max(34, item.height - 8) : 30, zIndex: item.depth + 3, ...statusStyle, ...(scheduled.late ? { borderColor: '#d37061', borderWidth: 2 } : {}) }} onContextMenu={e => e.preventDefault()} onPointerDown={e => parent ? beginParentPan(e) : begin(e, task, 'move')} onPointerMove={moving} onPointerUp={finish} onPointerCancel={cancel} onClick={() => { if (!skipClick.current) onSelect(task.uid); skipClick.current = false; }} onKeyDown={e => { if (e.key === 'Enter') onSelect(task.uid); if (e.key === 'Escape') cancel(); }} onMouseEnter={e => { if (!dragRef.current && !parent) setHover({ uid: task.uid, x: e.clientX, y: e.clientY }); }} onMouseLeave={() => setHover(null)}><span className="bar-handle left" onPointerDown={e => begin(e, task, 'start')} /><span className="bar-name">{task.name}</span><span className="bar-handle right" onPointerDown={e => begin(e, task, 'end')} /></div>;
        })}</div>
        {!tasks.length && <div className="empty">还没有任务。点击“新增任务”开始安排。</div>}
        <svg className="dependency-layer" width={width} height={height} style={{ left: taskListWidth }}><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>{tasks.flatMap(task => task.dependencies.filter(dep => task.uid === selected || dep === selected).map(dep => { const a = schedule.get(dep), b = schedule.get(task.uid), from = byUid.get(dep), to = byUid.get(task.uid); if (!a || !b || !from || !to) return null; const ax = x(a.end), ay = from.top + 20, bx = x(b.start), by = to.top + 20, c1x = ax + 22, c2x = bx - 22; const d = `M${ax},${ay} C${c1x},${ay} ${c2x},${by} ${bx},${by}`; const mx = (ax + 3 * c1x + 3 * c2x + bx) / 8, my = (ay + 3 * ay + 3 * by + by) / 8, dx = 3 * ((c1x - ax) + 2 * (c2x - c1x) + (bx - c2x)) / 4, dy = 3 * ((ay - ay) + 2 * (by - ay) + (by - by)) / 4, length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length; return <g key={`${dep}-${task.uid}`}><path className="dependency-halo" d={d} /><path className="dependency-arrow" d={d} /><line className="dependency-arrowhead-halo" x1={mx - ux * 5} y1={my - uy * 5} x2={mx + ux * 5} y2={my + uy * 5} /><line className="dependency-arrowhead" x1={mx - ux * 5} y1={my - uy * 5} x2={mx + ux * 5} y2={my + uy * 5} markerEnd="url(#arrow)" /></g>; }))}</svg>
      </div>
    </div></div>
    {drag?.mode === 'dependency' && <svg className="drag-arrow"><defs><marker id="drag-arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L9 4 L0 8" fill="#187b74" /></marker></defs><path d={`M${drag.x},${drag.y} L${drag.x + drag.dx},${drag.y + drag.dy}`} markerEnd="url(#drag-arrowhead)" /></svg>}
    {hover && !drag && <HoverCard task={tasks.find(task => task.uid === hover.uid)!} scheduled={schedule.get(hover.uid)!} project={project} x={hover.x} y={hover.y} />}
  </div>;
}

function HoverCard({ task, scheduled, project, x, y }: { task: Task; scheduled: Scheduled; project: Project; x: number; y: number }) {
  return <div className="hover-card" style={{ left: Math.max(8, Math.min(x + 14, window.innerWidth - 350)), top: Math.max(8, Math.min(y + 18, window.innerHeight - 390)) }}><span className="eyebrow">TASK PREVIEW</span><h3>{task.name}</h3><dl><dt>任务详情</dt><dd className="task-preview-description">{task.description || '暂无详情'}</dd><dt>执行人 / 状态</dt><dd>{task.assignee || '未指定'} / {task.status}</dd><dt>排期状态</dt><dd className={scheduled.late ? 'late-preview' : ''}>{scheduled.late ? '⚠ 已超期' : '正常'}</dd><dt>最早开始</dt><dd>{task.earliest_start ? formatMoment(task.earliest_start) : `项目开始日 ${project.project.start_date}`}</dd><dt>最迟完成</dt><dd>{formatMoment(task.latest_finish)}</dd><dt>预计耗时</dt><dd>{task.duration_days} 天</dd><dt>前置依赖</dt><dd>{task.dependencies.map(uid => project.tasks.find(value => value.uid === uid)?.name).join('、') || '无'}</dd><dt>计算开始</dt><dd>{formatSlot(scheduled.start)}</dd><dt>计算完成</dt><dd>{formatSlot(scheduled.end - 1)}</dd></dl><small>点击任务条固定详情并编辑</small></div>;
}

function TaskLabel({ item, isParent, listWidth, selected, dimmed, total, onSelect, onOrder, onSiblingOrder }: { item: ReturnType<typeof ganttTreeLayout>['items'][number]; isParent: boolean; listWidth: number; selected: string | null; dimmed: boolean; total: number; onSelect: (uid: string) => void; onOrder: (uid: string, order: number) => void; onSiblingOrder: (uid: string, targetUid: string) => void }) {
  const task = item.task;
  const top = item.top + (isParent ? 4 : 6);
  const height = 30;
  return <div className={`gantt-row tree-task-cell ${isParent ? 'tree-parent-cell' : ''} ${selected === task.uid ? 'selected-row' : ''} ${dimmed ? 'muted-row' : ''}`} data-task-uid={task.uid} style={{ top, height, width: listWidth, paddingLeft: 8 + item.depth * 18, zIndex: item.depth + 6 }} onDragOver={e => e.preventDefault()} onDrop={e => { const uid = e.dataTransfer.getData('text/mission-uid'); if (uid) { e.preventDefault(); onSiblingOrder(uid, task.uid); } }}><span className="tree-branch">{item.depth ? '└' : ''}</span><span className="row-grip" draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/mission-uid', task.uid); }}>⠿</span><span className="row-number" title={task.uid}>{task.uid}</span><button className="task-title" onClick={() => onSelect(task.uid)}><strong>{task.name}</strong>{!isParent && <span className="task-assignee">{task.assignee || '未指定执行人'}</span>}</button><div className="row-order"><button aria-label={`上移 ${task.name}`} disabled={task.order === 1} onClick={() => onOrder(task.uid, task.order - 1)}>↑</button><button aria-label={`下移 ${task.name}`} disabled={task.order === total} onClick={() => onOrder(task.uid, task.order + 1)}>↓</button></div></div>;
}
