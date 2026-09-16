import { useState } from 'react';
import { descendantUids, statuses, type HalfDay, type Project, type Task } from './model';
import { formatSlot, type Scheduled } from './schedule';
import { SearchableSelect } from './SearchableSelect';
import type { RelationDragController } from './useRelationDrag';

function MomentInput({ title, value, onChange }: { title: string; value: HalfDay | null; onChange: (v: HalfDay | null) => void }) {
  return <label>{title}<div className="inline"><input aria-label={title} type="date" min="1900-01-01" max="2199-12-31" value={value?.date || ''} onChange={e => onChange(e.target.value ? { date: e.target.value, period: value?.period || 'am' } : null)} /><SearchableSelect label={`${title}时段`} value={value?.period || 'am'} disabled={!value} onChange={period => value && onChange({ ...value, period: period as 'am' | 'pm' })} options={[{ value: 'am', label: '上午' }, { value: 'pm', label: '下午' }]} /></div></label>;
}
export function TaskEditor({ task, project, scheduled, relation, onChange, onParentChange, onOrder, onDependency, onAdd, onDelete, onClose }: {
  task: Task; project: Project; scheduled?: Scheduled;
  relation: RelationDragController;
  onChange: (task: Task) => void; onParentChange: (parentUid: string | null) => void; onOrder: (order: number) => void;
  onDependency: (from: string, to: string) => void; onAdd: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [labels, setLabels] = useState(task.labels.join(', '));
  const [dependency, setDependency] = useState('');
  const childUids = new Set(project.tasks.filter(value => value.parent_uid === task.uid).map(value => value.uid));
  const forbiddenParents = descendantUids(project, task.uid);
  const parentChoices = project.tasks.filter(value => value.uid !== task.uid && !forbiddenParents.has(value.uid));
  const isParent = childUids.size > 0;
  const set = <K extends keyof Task>(key: K, value: Task[K]) => onChange({ ...task, [key]: value });
  return <aside className="editor" aria-label="任务详情编辑">
    <div className="panel-heading"><div><span className="eyebrow">TASK DETAILS</span><h2>任务详情</h2></div><div className="panel-heading-actions"><button className="panel-add-task" aria-label="新建任务" onClick={onAdd}>＋ 新建任务</button><button className="icon-button" aria-label="关闭任务详情" onClick={onClose}>×</button></div></div>
    <p className="muted small">编辑即时预览 · 保存并备份后写入 YAML</p>
    <div role="button" tabIndex={0} aria-label="从当前任务拖动关系" data-testid="detail-relation-handle"
      className={`detail-relation-handle ${relation.drag?.uid === task.uid ? relation.drag.mode : ''}`}
      onContextMenu={event => event.preventDefault()} onPointerDown={event => relation.begin(event, task)}
      onPointerMove={relation.move} onPointerUp={relation.finish} onPointerCancel={relation.cancel}>
      <span className="relation-grip">↗</span><span><strong>关系拖拽区</strong><small>{isParent ? '按住 R 后右键拖到任务：设置父任务' : '右键拖到前置任务：当前任务依赖它 · 按住 R：设置父任务'}</small></span>
    </div>
    <label>任务 UID<input readOnly value={task.uid} className="mono" /></label>
    <label>排序 ID<input type="number" min="1" max={project.tasks.length} defaultValue={task.order} key={task.order} onBlur={e => { const n = Number(e.target.value); if (Number.isInteger(n)) onOrder(n); }} /></label>
    <label>父任务<SearchableSelect label="父任务" value={task.parent_uid || ''} onChange={value => onParentChange(value || null)} options={[{ value: '', label: '无（根任务）' }, ...parentChoices.map(value => ({ value: value.uid, label: `${value.order}. ${value.name}` }))]} /></label>
    {isParent && <p className="field-note">这是父任务：排期由子任务自动汇总，不能单独设置工期、开始时间或前置依赖。</p>}
    <label className="checkbox" title={isParent ? '折叠后隐藏所有层级的子任务' : '当前任务没有子任务'}><input type="checkbox" disabled={!isParent} checked={task.collapse_children} onChange={e => set('collapse_children', e.target.checked)} />折叠子任务</label>
    <label>任务名称<input value={task.name} maxLength={200} onChange={e => set('name', e.target.value)} /></label>
    <label>任务详情<textarea rows={3} value={task.description} onChange={e => set('description', e.target.value)} /></label>
    <div className="two-columns"><label>执行人<SearchableSelect label="执行人" value={task.assignee} onChange={value => set('assignee', value)} options={project.project.assignees.map(value => ({ value, label: value }))} /></label><label>当前状态<SearchableSelect label="当前状态" value={task.status} onChange={value => set('status', value as Task['status'])} options={statuses.map(value => ({ value, label: value }))} /></label></div>
    <fieldset disabled={isParent}>
    <MomentInput title="最早可开始时间" value={task.earliest_start} onChange={v => set('earliest_start', v)} />
    {!task.earliest_start && <p className="field-note">使用项目开始日期：{project.project.start_date} 上午</p>}
    <MomentInput title="最迟需完成时间" value={task.latest_finish} onChange={v => set('latest_finish', v)} />
    <label>预计耗时（天）<input type="number" min="0.5" step="0.5" value={task.duration_days} onChange={e => set('duration_days', Number(e.target.value))} /></label>
    <label className="checkbox"><input type="checkbox" checked={task.allow_rest_day_work} onChange={e => set('allow_rest_day_work', e.target.checked)} />允许休息日工作</label>
    </fieldset>
    <label>自定义标签<input value={labels} placeholder="用逗号分隔，例如：开发, 核心" onChange={e => { setLabels(e.target.value); set('labels', [...new Set(e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean))]); }} /></label>
    {!isParent && <><div className="field-label">前置依赖任务</div>
    <div className="dependency-list">{task.dependencies.length === 0 && <span className="muted small">无前置依赖</span>}{task.dependencies.map(uid => <div key={uid}><span>{project.tasks.find(t => t.uid === uid)?.name || uid}<small className="mono">{uid}</small></span><button aria-label={`移除依赖 ${uid}`} onClick={() => set('dependencies', task.dependencies.filter(d => d !== uid))}>×</button></div>)}</div>
    <div className="inline"><SearchableSelect label="选择前置任务" value={dependency} onChange={setDependency} options={[{ value: '', label: '选择前置任务…' }, ...project.tasks.filter(t => t.uid !== task.uid && !task.dependencies.includes(t.uid) && !project.tasks.some(value => value.parent_uid === t.uid)).map(t => ({ value: t.uid, label: `${t.order}. ${t.name}` }))]} /><button disabled={!dependency} onClick={() => { onDependency(dependency, task.uid); setDependency(''); }}>添加</button></div></>}
    {scheduled && <div className={`computed ${scheduled.late ? 'danger-box' : ''}`}><span>计算后的排期</span><strong>{formatSlot(scheduled.start)}</strong><span>至 {formatSlot(scheduled.end - 1)}</span>{scheduled.late && <b>超过最迟完成时间</b>}{scheduled.unknownYears.length > 0 && <span>暂估：缺少 {scheduled.unknownYears.join('、')} 年日历</span>}</div>}
    <button className="danger-text full-width" disabled={isParent} title={isParent ? '请先处理子任务' : undefined} onClick={onDelete}>删除任务</button>
  </aside>;
}
