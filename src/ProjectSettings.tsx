import { useState } from 'react';
import type { Project } from './model';

export function ProjectSettings({ project, onChange, onClose, notify }: {
  project: Project;
  onChange: (project: Project) => void;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [assignee, setAssignee] = useState('');
  const update = (changes: Partial<Project['project']>) => onChange({ ...project, project: { ...project.project, ...changes } });
  function addAssignee() {
    const name = assignee.trim();
    if (!name) return notify('执行人名称不能为空。');
    if (project.project.assignees.includes(name)) return notify(`执行人「${name}」已存在。`);
    update({ assignees: [...project.project.assignees, name] }); setAssignee('');
  }
  function removeAssignee(name: string) {
    const used = project.tasks.filter(task => task.assignee === name);
    if (used.length) return notify(`不能删除执行人「${name}」：${used.map(task => task.name).join('、')} 仍由其负责。请先重新分配任务。`);
    if (project.project.assignees.length === 1) return notify('项目至少需要保留一个执行人。');
    update({ assignees: project.project.assignees.filter(value => value !== name) });
  }
  return <div className="modal-backdrop"><section className="modal settings-modal" role="dialog" aria-modal="true" aria-label="项目设置">
    <div className="panel-heading"><h2>项目设置</h2><button aria-label="关闭项目设置" onClick={onClose}>×</button></div>
    <label>项目名称<input value={project.project.name} onChange={event => update({ name: event.target.value })} /></label>
    <label>项目开始日期<input type="date" value={project.project.start_date} min="1900-01-01" max="2199-12-31" onChange={event => update({ start_date: event.target.value })} /></label>
    <label className="checkbox settings-checkbox"><input type="checkbox" checked={project.project.allow_assignee_parallel_tasks} onChange={event => update({ allow_assignee_parallel_tasks: event.target.checked })} />允许同一个执行人同时有并行任务</label>
    <p className="muted">取消勾选后，同一执行人的叶子任务将按显式依赖、最早可开始时间和任务排序依次排程，并生成不写入 dependencies 的运行时资源关系。缺省开始时间仍使用项目开始日上午；默认粒度和筛选可在甘特图工具栏设置。</p>
    <div className="field-label">执行人名单</div>
    <div className="assignee-settings-list">{project.project.assignees.map(name => <div key={name}><span>{name}</span><button aria-label={`删除执行人 ${name}`} onClick={() => removeAssignee(name)}>删除</button></div>)}</div>
    <div className="inline assignee-add"><input aria-label="新增执行人" value={assignee} maxLength={200} placeholder="输入新执行人名称" onChange={event => setAssignee(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addAssignee(); } }} /><button disabled={!assignee.trim()} onClick={addAssignee}>添加执行人</button></div>
    <button className="primary full-width" onClick={onClose}>完成编辑</button>
  </section></div>;
}
