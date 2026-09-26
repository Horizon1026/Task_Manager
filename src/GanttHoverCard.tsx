import type { Project, Task } from './model';
import { formatMoment, formatSlot } from './dateCalendar';
import type { Scheduled } from './schedule';
import type { EffectiveDependencyEdge } from './effectiveDependencies';

export function GanttHoverCard({ task, scheduled, project, dependencyEdges, x, y }: { task: Task; scheduled: Scheduled; project: Project; dependencyEdges: EffectiveDependencyEdge[]; x: number; y: number }) {
  const automatic = dependencyEdges.filter(edge => edge.to === task.uid && edge.kind === 'assignee').map(edge => project.tasks.find(value => value.uid === edge.from)?.name || edge.from);
  return <div className="hover-card" style={{ left: Math.max(8, Math.min(x + 14, window.innerWidth - 350)), top: Math.max(8, Math.min(y + 18, window.innerHeight - 390)) }}><span className="eyebrow">TASK PREVIEW</span><h3>{task.name}</h3><dl><dt>任务详情</dt><dd className="task-preview-description">{task.description || '暂无详情'}</dd><dt>执行人 / 状态</dt><dd>{task.assignee || '未指定'} / {task.status}</dd><dt>排期状态</dt><dd className={scheduled.late ? 'late-preview' : ''}>{scheduled.late ? '⚠ 已超期' : '正常'}</dd><dt>最早开始</dt><dd>{task.earliest_start ? formatMoment(task.earliest_start) : `项目开始日 ${project.project.start_date}`}</dd><dt>最迟完成</dt><dd>{formatMoment(task.latest_finish)}</dd><dt>预计耗时</dt><dd>{task.duration_days} 天</dd><dt>前置依赖</dt><dd>{task.dependencies.map(uid => project.tasks.find(value => value.uid === uid)?.name).join('、') || '无'}</dd>{automatic.length > 0 && <><dt>自动串行</dt><dd>{automatic.join('、')}</dd></>}<dt>计算开始</dt><dd>{formatSlot(scheduled.start)}</dd><dt>计算完成</dt><dd>{formatSlot(scheduled.end - 1)}</dd></dl><small>点击任务条固定详情并编辑</small></div>;
}
