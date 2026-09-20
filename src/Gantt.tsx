import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { type Project, type Scale, type Task } from './model';
import { dayNumber, dateString, durationBetween, fromSlot, makeCalendar, nextWorkSlot, type Scheduled, todayLocal } from './schedule';
import { alignStart, pixelsPerDay, timeColumns } from './timeline';
import { dependencyFocus, displayDependencyEdges, ganttTreeLayout } from './ganttLayout';
import { GANTT_BAR_TOP, GANTT_PARENT_INSET, GANTT_PARENT_MIN_HEIGHT, GANTT_SIZING } from './ganttSizing';
import type { RelationDragController } from './useRelationDrag';
import { GanttDependencyLayer } from './GanttDependencyLayer';
import { GanttHoverCard } from './GanttHoverCard';
import { GanttTaskLabel } from './GanttTaskLabel';
import type { EffectiveDependencyEdge } from './effectiveDependencies';
import './tree.css';
import './ganttOverrides.css';

type Drag = { uid: string; mode: 'move' | 'start' | 'end'; x: number; y: number; dx: number; dy: number; moved: boolean };
type Props = { project: Project; schedule: Map<string, Scheduled>; dependencyEdges: EffectiveDependencyEdge[]; scale: Scale; selected: string | null; filter: { labels: string[]; mode: 'and' | 'or' }; focusUid: string | null; canFocus: boolean; onFocusChange: (uid: string | null) => void; onSelect: (uid: string | null) => void; onChange: (task: Task) => void; onOrder: (uid: string, order: number) => void; onSiblingOrder: (uid: string, targetUid: string) => void; onToggleCollapse: (uid: string) => void; relation: RelationDragController; notify: (message: string) => void };
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4] as const;

export function Gantt({ project, schedule, dependencyEdges, scale, selected, filter, focusUid, canFocus, onFocusChange, onSelect, onChange, onOrder, onSiblingOrder, onToggleCollapse, relation, notify }: Props) {
  const allTasks = [...project.tasks].sort((a, b) => a.order - b.order);
  const matches = (task: Task) => !filter.labels.length || (filter.mode === 'and' ? filter.labels.every(label => task.labels.includes(label)) : filter.labels.some(label => task.labels.includes(label)));
  const filteredUids = useMemo(() => {
    if (!filter.labels.length) return new Set(allTasks.map(task => task.uid));
    const result = new Set(allTasks.filter(matches).map(task => task.uid));
    const parents = new Map(allTasks.map(task => [task.uid, task.parent_uid]));
    for (const task of allTasks.filter(matches)) {
      let parent = task.parent_uid;
      while (parent !== null) { result.add(parent); parent = parents.get(parent) ?? null; }
    }
    return result;
  }, [allTasks, filter]);
  const focus = useMemo(() => focusUid ? dependencyFocus(project, focusUid, dependencyEdges) : null, [project, focusUid, dependencyEdges]);
  const visibleUids = focus?.visibleUids ?? filteredUids;
  const tasks = allTasks.filter(task => visibleUids.has(task.uid));
  const visibleProject = useMemo(() => ({ ...project, tasks }), [project, tasks]);
  const layout = useMemo(() => ganttTreeLayout(visibleProject), [visibleProject]);
  const byUid = useMemo(() => new Map(layout.items.map(item => [item.task.uid, item])), [layout]);
  const displayedUids = useMemo(() => new Set(layout.items.map(item => item.task.uid)), [layout]);
  const dependencyProject = useMemo(() => focusUid && focus && focus.memberUids.size > 1
    ? { ...project, tasks: project.tasks.map(task => task.uid === focusUid ? { ...task, collapse_children: true } : task) }
    : project, [project, focusUid, focus]);
  const displayedDependencyEdges = useMemo(() => displayDependencyEdges(dependencyProject, displayedUids, dependencyEdges), [dependencyProject, displayedUids, dependencyEdges]);
  const [taskListWidth, setTaskListWidth] = useState(260);
  const [viewportWidth, setViewportWidth] = useState(1360);
  const [zoom, setZoom] = useState<number>(1);
  const ppd = pixelsPerDay[scale] * zoom, pps = ppd / 2, calendar = useMemo(() => makeCalendar(project), [project]);
  const origin = alignStart(Math.min(dayNumber(project.project.start_date) - 2, ...[...schedule.values()].map(value => Math.floor(value.start / 2) - 2)), scale);
  const timelineViewportWidth = Math.max(1100, viewportWidth - taskListWidth);
  const end = Math.max(origin + Math.ceil(timelineViewportWidth / ppd), ...[...schedule.values()].map(value => Math.ceil(value.end / 2) + 10));
  const width = Math.ceil((end - origin) * ppd), columns = timeColumns(origin, end, scale), height = Math.max(240, layout.height);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const dragRef = useRef<Drag | null>(null), resizeRef = useRef<{ x: number; width: number } | null>(null), panRef = useRef<{ x: number; scrollLeft: number; moved: boolean } | null>(null), focusPositionRef = useRef<{ scrollLeft: number; windowX: number; windowY: number } | null>(null), zoomAnchorRef = useRef<number | null>(null), skipClick = useRef(false), scroll = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(hover), focusRef = useRef(focusUid), canFocusRef = useRef(canFocus), relationRef = useRef(relation.drag);
  hoverRef.current = hover; focusRef.current = focusUid; canFocusRef.current = canFocus; relationRef.current = relation.drag;
  useEffect(() => {
    const node = scroll.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const update = () => setViewportWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = scroll.current, anchorSlot = zoomAnchorRef.current;
    if (!node || anchorSlot === null) return;
    zoomAnchorRef.current = null;
    const visibleTimelineWidth = Math.max(0, node.clientWidth - taskListWidth);
    node.scrollLeft = Math.max(0, (anchorSlot - origin * 2) * pps - visibleTimelineWidth / 2);
  }, [zoom, origin, pps, taskListWidth]);
  useEffect(() => {
    const releaseFocus = () => {
      if (!focusRef.current) return;
      const position = focusPositionRef.current;
      focusRef.current = null; focusPositionRef.current = null; onFocusChange(null);
      if (position) requestAnimationFrame(() => {
        if (scroll.current) scroll.current.scrollLeft = position.scrollLeft;
        window.scrollTo(position.windowX, position.windowY);
      });
    };
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) cancelSchedule();
      const target = event.target;
      if (event.key.toLowerCase() !== 'm' || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
        || focusRef.current || !canFocusRef.current || !hoverRef.current || dragRef.current || relationRef.current
        || target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      focusPositionRef.current = { scrollLeft: scroll.current?.scrollLeft ?? 0, windowX: window.scrollX, windowY: window.scrollY };
      focusRef.current = hoverRef.current.uid; hoverRef.current = null; onFocusChange(focusRef.current); setHover(null);
    };
    const up = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'm') { event.preventDefault(); releaseFocus(); } };
    const blur = () => { cancelSchedule(); releaseFocus(); };
    const visibility = () => { if (document.hidden) releaseFocus(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, [onFocusChange]);
  useEffect(() => { if (focusUid && !canFocus) onFocusChange(null); }, [focusUid, canFocus, onFocusChange]);
  const x = (slot: number) => (slot - origin * 2) * pps;
  const isParent = (task: Task) => project.tasks.some(value => value.parent_uid === task.uid);
  function changeZoom(next: number) {
    const node = scroll.current;
    if (node) {
      const visibleTimelineWidth = Math.max(0, node.clientWidth - taskListWidth);
      zoomAnchorRef.current = origin * 2 + (node.scrollLeft + visibleTimelineWidth / 2) / pps;
    }
    setZoom(next);
  }
  const zoomIndex = ZOOM_LEVELS.indexOf(zoom as typeof ZOOM_LEVELS[number]);
  function begin(e: ReactPointerEvent<HTMLElement>, task: Task, mode: Drag['mode']) {
    if (focusUid) return;
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 2) { if (relation.begin(e, task)) setHover(null); return; }
    if (isParent(task)) return;
    e.preventDefault(); e.stopPropagation();
    setHover(null);
    const value: Drag = { uid: task.uid, mode, x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false };
    dragRef.current = value; setDrag(value); e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moving(e: ReactPointerEvent<HTMLElement>) { if (relation.move(e) || !dragRef.current) return; const value = { ...dragRef.current, dx: e.clientX - dragRef.current.x, dy: e.clientY - dragRef.current.y, moved: dragRef.current.moved || Math.abs(e.clientX - dragRef.current.x) + Math.abs(e.clientY - dragRef.current.y) > 4 }; dragRef.current = value; setDrag(value); }
  function finish(e: ReactPointerEvent<HTMLElement>) {
    if (relation.finish(e)) { skipClick.current = true; return; }
    const value = dragRef.current; if (!value) return; dragRef.current = null; setDrag(null); skipClick.current = value.moved; if (!value.moved) return;
    const task = tasks.find(item => item.uid === value.uid)!, scheduled = schedule.get(value.uid); if (!scheduled) return;
    const delta = Math.round(value.dx / pps);
    try {
      if (value.mode === 'end') { const endSlot = scheduled.end + delta; if (endSlot <= scheduled.start) return notify('预计耗时不能小于 0.5 天。'); const duration = durationBetween(scheduled.start, endSlot, task, calendar); if (duration < 0.5) return notify('预计耗时不能小于 0.5 天。'); onChange({ ...task, duration_days: duration }); }
      else { const candidate = scheduled.start + delta; if (candidate < scheduled.dependencyFloor) return notify('已阻止拖动：开始时间不能早于前置任务完成后的时段。'); if (candidate < dayNumber('1900-01-01') * 2) return notify('日期超出支持范围。'); onChange({ ...task, earliest_start: fromSlot(nextWorkSlot(candidate, task, calendar)) }); }
    } catch (error) { notify((error as Error).message); }
  }
  function cancelSchedule() { dragRef.current = null; setDrag(null); skipClick.current = true; }
  function cancel() { cancelSchedule(); relation.cancel(); }
  function beginListResize(e: ReactPointerEvent<HTMLSpanElement>) {
    if (focusUid) return;
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
  function beginFocusPan(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !scroll.current) return;
    panRef.current = { x: e.clientX, scrollLeft: scroll.current.scrollLeft, moved: false };
    scroll.current.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault();
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
  const hoverTask = hover ? tasks.find(task => task.uid === hover.uid) : undefined;
  return <div className={`gantt-section ${focusUid ? 'dependency-focus-mode' : ''}`}>
    <div className="gantt-caption"><span>{dateString(origin)} — {dateString(end - 1)}</span><span>{focusUid ? `正在查看「${project.tasks.find(task => task.uid === focusUid)?.name}」的直接依赖 · 只读 · 松开 M 恢复` : '右键拖动设置依赖 · R + 右键拖动设置父任务 · 悬浮按住 M 聚焦'}</span><div className="gantt-caption-actions"><div className="gantt-zoom" role="group" aria-label="甘特图水平缩放"><button type="button" aria-label="缩小甘特图" title="缩小时间轴" disabled={zoomIndex <= 0} onClick={() => changeZoom(ZOOM_LEVELS[zoomIndex - 1])}>−</button><button type="button" className="zoom-value" aria-label="重置甘特图缩放" title="恢复 100%" disabled={zoom === 1} onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="放大甘特图" title="放大时间轴，让半天任务更宽" disabled={zoomIndex >= ZOOM_LEVELS.length - 1} onClick={() => changeZoom(ZOOM_LEVELS[zoomIndex + 1])}>＋</button></div><button disabled={!!focusUid} onClick={() => { if (scroll.current) scroll.current.scrollLeft = Math.max(0, (dayNumber(todayLocal()) - origin) * ppd - 100); }}>定位今天</button></div></div>
    <div className="gantt-scroll" ref={scroll} onPointerDown={beginPan} onPointerMove={pan} onPointerUp={finishPan} onPointerCancel={finishPan} onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} tabIndex={0}><div className="gantt-canvas" style={{ width: width + taskListWidth }}>
      <div className="gantt-header"><div className="task-heading" style={{ width: taskListWidth, minWidth: taskListWidth }}>任务 / 执行人<span>{tasks.length} 条</span><span role="separator" aria-label="调整任务列表宽度" aria-orientation="vertical" className="task-list-resize-handle" onPointerDown={beginListResize} onPointerMove={resizeList} onPointerUp={finishListResize} onPointerCancel={finishListResize} /></div><div className="time-heading" style={{ width }}>{columns.map(column => <div key={column.start} style={{ left: (column.start - origin) * ppd, width: (column.end - column.start) * ppd }}>{column.label}{scale === 'day' && <small>上午　下午</small>}</div>)}</div></div>
      <div className="gantt-body tree-gantt-body" style={{ minHeight: height }}>
        <div className="time-background" style={{ left: taskListWidth, width, backgroundSize: `${ppd}px 100%` }}>{ppd >= 3 && end - origin <= 5000 && Array.from({ length: Math.ceil(end - origin) }, (_, index) => !calendar(dateString(origin + index)).isWorkday && <div className="rest-column" key={index} style={{ left: index * ppd, width: ppd }} />)}{columns.map(column => <div className="period-line" key={column.start} style={{ left: (column.start - origin) * ppd }} />)}<div className="today-line" style={{ left: (dayNumber(todayLocal()) - origin) * ppd }}><span>今天</span></div></div>
        <div className="tree-task-labels" style={{ width: taskListWidth, transform: `translateX(${scrollLeft}px)` }}>{layout.items.map(item => <GanttTaskLabel key={item.task.uid} item={item} isParent={isParent(item.task)} listWidth={taskListWidth} selected={selected} dimmed={!!focus && !focus.coreUids.has(item.task.uid)} locked={!!focusUid} total={allTasks.length} onHover={value => { if (!focusUid) { hoverRef.current = value; setHover(value); } }} onSelect={onSelect} onOrder={onOrder} onSiblingOrder={onSiblingOrder} onToggleCollapse={onToggleCollapse} />)}</div>
        <div className="tree-task-tracks" style={{ left: taskListWidth, width }}>{layout.items.map(item => {
          const task = item.task, scheduled = schedule.get(task.uid), active = drag?.uid === task.uid, delta = active ? Math.round(drag.dx / pps) : 0;
          const left = scheduled ? x(scheduled.start) + (active && drag.mode !== 'end' ? delta * pps : 0) : 0, barWidth = scheduled ? Math.max(8, (scheduled.end - scheduled.start + (active && drag.mode === 'end' ? delta : 0)) * pps) : 0;
          const blocked = !!scheduled && active && drag.mode !== 'end' && scheduled.start + delta < scheduled.dependencyFloor;
          const parent = isParent(task), color = project.project.status_colors[task.status];
          const statusStyle = parent && !task.collapse_children ? { borderColor: color.border, color: color.text } : { backgroundColor: color.fill, borderColor: color.border, color: color.text };
          const dimmed = !!focus && !focus.coreUids.has(task.uid);
          return scheduled && <div role="button" tabIndex={focusUid ? -1 : 0} key={task.uid} data-task-uid={task.uid} data-testid={`bar-${task.uid}`} aria-label={`任务条 ${task.name}`} className={`task-bar ${parent ? 'parent-task-bar' : 'child-task-bar'} ${parent && task.collapse_children ? 'collapsed-parent-task-bar' : ''} ${scheduled.late ? 'late' : ''} ${blocked ? 'blocked' : ''} ${active ? 'dragging' : ''} ${dimmed ? 'muted-row' : ''} ${task.uid === focusUid ? 'focus-source' : ''} ${relation.drag?.mode === 'parent' && relation.drag.target === task.uid ? relation.parentError ? 'parent-drop-invalid' : 'parent-drop-valid' : ''}`} style={{ left, width: barWidth, top: item.top + (parent ? GANTT_PARENT_INSET : GANTT_BAR_TOP), height: parent ? Math.max(GANTT_PARENT_MIN_HEIGHT, item.height - GANTT_PARENT_INSET * 2) : GANTT_SIZING.barHeight, zIndex: item.depth + 3, ...statusStyle, ...(scheduled.late ? { borderColor: '#d37061', borderWidth: 2 } : {}) }} onContextMenu={e => e.preventDefault()} onPointerDown={e => focusUid ? beginFocusPan(e) : parent && e.button === 0 ? beginParentPan(e) : begin(e, task, 'move')} onPointerMove={moving} onPointerUp={finish} onPointerCancel={cancel} onClick={() => { if (!focusUid && !skipClick.current) onSelect(task.uid); skipClick.current = false; }} onKeyDown={e => { if (!focusUid && e.key === 'Enter') onSelect(task.uid); if (e.key === 'Escape') cancel(); }} onMouseEnter={e => { if (!focusUid && !dragRef.current && !relation.drag) { const value = { uid: task.uid, x: e.clientX, y: e.clientY }; hoverRef.current = value; setHover(value); } }} onMouseLeave={() => { if (!focusUid) { hoverRef.current = null; setHover(null); } }}><span className="bar-handle left" onPointerDown={focusUid ? undefined : e => begin(e, task, 'start')} /><span className="bar-name">{task.name}</span><span className="bar-handle right" onPointerDown={focusUid ? undefined : e => begin(e, task, 'end')} /></div>;
        })}</div>
        {!tasks.length && <div className="empty">还没有任务。点击“新增任务”开始安排。</div>}
        <GanttDependencyLayer edges={displayedDependencyEdges} schedule={schedule} itemsByUid={byUid} activeUid={focusUid ?? selected} width={width} height={height} left={taskListWidth} slotToX={x} />
      </div>
    </div></div>
    {relation.drag && <svg className={`drag-arrow ${relation.drag.mode === 'parent' ? 'parent-drag-arrow' : ''}`}><defs><marker id="drag-arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L9 4 L0 8" fill={relation.drag.mode === 'parent' ? '#7c3aed' : '#187b74'} /></marker></defs><path d={relation.drag.mode === 'parent' ? `M${relation.drag.x},${relation.drag.y} L${relation.drag.x + relation.drag.dx},${relation.drag.y + relation.drag.dy}` : `M${relation.drag.x + relation.drag.dx},${relation.drag.y + relation.drag.dy} L${relation.drag.x},${relation.drag.y}`} markerEnd="url(#drag-arrowhead)" /></svg>}
    {relation.drag?.mode === 'parent' && <div className="drag-hint" role="status">设置父任务：{project.tasks.find(task => task.uid === relation.drag!.uid)?.name} → {project.tasks.find(task => task.uid === relation.drag!.target)?.name || '拖到目标任务'}{relation.parentError ? ` · ${relation.parentError}` : ''} · Esc 取消</div>}
    {hover && hoverTask && !focusUid && !drag && !relation.drag && !isParent(hoverTask) && <GanttHoverCard task={hoverTask} scheduled={schedule.get(hover.uid)!} project={project} dependencyEdges={dependencyEdges} x={hover.x} y={hover.y} />}
  </div>;
}
