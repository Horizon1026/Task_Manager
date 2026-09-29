import { taskDisplayName } from './taskPreview';
import { observeFloatingCard } from './floatingCard';
import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef } from 'react';
import type { Project, Task } from './model';
import { formatMoment, formatSlot } from './dateCalendar';
import type { Scheduled } from './schedule';
import type { EffectiveDependencyEdge } from './effectiveDependencies';

export function GanttHoverCard({ task, scheduled, project, dependencyEdges, x, y, parallel, onMouseEnter, onMouseLeave }: { parallel: boolean; onMouseEnter: () => void; onMouseLeave: () => void; task: Task; scheduled: Scheduled; project: Project; dependencyEdges: EffectiveDependencyEdge[]; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && contentRef.current) return observeFloatingCard(ref.current, contentRef.current, x, y);
  }, [x, y]);
  const automatic = dependencyEdges.filter(edge => edge.to === task.uid && edge.kind === 'assignee').map(edge => project.tasks.find(value => value.uid === edge.from)?.name || edge.from);
  return createPortal(<div ref={ref} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="hover-card"><div ref={contentRef} className="hover-card-content"><span className="eyebrow">TASK PREVIEW</span><h3>{taskDisplayName(task)}</h3><dl><dt>任务详情</dt><dd className="task-preview-description">{task.description || '暂无详情'}</dd><dt>执行人 / 状态</dt><dd>{task.assignee || '未指定'} / {task.status}</dd><dt>排期状态</dt><dd className={scheduled.late ? 'late-preview' : ''}>{scheduled.late ? '⚠ 已超期' : '正常'}{parallel && <span className="parallel-preview"> · ⚠ 同执行人任务并行</span>}</dd><dt>最早开始</dt><dd>{task.earliest_start ? formatMoment(task.earliest_start) : `项目开始日 ${project.project.start_date}`}</dd><dt>最迟完成</dt><dd>{formatMoment(task.latest_finish)}</dd><dt>预计耗时</dt><dd>{task.duration_days} 天</dd><dt>前置依赖</dt><dd>{task.dependencies.map(uid => project.tasks.find(value => value.uid === uid)?.name).join('、') || '无'}</dd>{automatic.length > 0 && <><dt>自动串行</dt><dd>{automatic.join('、')}</dd></>}<dt>计算开始</dt><dd>{formatSlot(scheduled.start)}</dd><dt>计算完成</dt><dd>{formatSlot(scheduled.end - 1)}</dd></dl><small>点击任务条固定详情并编辑</small></div></div>, document.body);
}
