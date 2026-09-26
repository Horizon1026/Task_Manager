import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useProjectSession } from './useProjectSession';
import { scaleNames, scales, statuses, type Project, type Scale, type Task, type TaskDefaults } from './model';
import { scheduleProjectPlan } from './schedule';
import { moveSiblingTask, moveTask } from './taskTree';
import { addTaskDependency, createTask, deleteTask, reparentTask, replaceTask, toggleTaskCollapse } from './taskCommands';
import { Gantt } from './Gantt';
import { TaskEditor } from './TaskEditor';
import { CalendarPanel } from './CalendarPanel';
import { SearchableSelect } from './SearchableSelect';
import { useRelationDrag } from './useRelationDrag';
import { downloadInteractiveGanttHtml } from './interactiveExport';
import { ProjectSettings } from './ProjectSettings';
import { setTheme, statusColorsByTheme } from './theme';

export function App() {
  const [selected, setSelected] = useState<string | null>(null), [scale, setScale] = useState<Scale>('week');
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [filter, setFilter] = useState<Project['project']['default_filter']>({ labels: [], mode: 'or' });
  const [message, setMessage] = useState(''), [modal, setModal] = useState<'calendar' | 'settings' | 'backups' | null>(null);
  const { snapshot, project, setProject, projectFiles, backups, dirty, saving, conflict, fileError, save,
    reload: reloadProject, openBackups: loadBackups, selectProjectFile: loadProjectFile, restore: restoreBackup } = useProjectSession({
    focusUid,
    notify: setMessage,
    onAccept: (value, initial) => { if (initial) { setScale(value.project.project.default_scale); setFilter(value.project.project.default_filter); } },
    onExternalRefresh: () => { setModal(null); setMessage('已加载外部修改的 YAML。'); },
  });
  const theme = project?.project.theme ?? 'light';
  useLayoutEffect(() => { setTheme(theme); }, [theme]);
  const calculated = useMemo(() => {
    try {
      if (!project) return { schedule: new Map(), dependencies: [], error: '' };
      const plan = scheduleProjectPlan(project);
      return { schedule: plan.schedule, dependencies: plan.dependencyEdges, error: '' };
    } catch (error) { return { schedule: new Map(), dependencies: [], error: (error as Error).message }; }
  }, [project]);
  useEffect(() => {
    if (focusUid && (selected !== null || modal !== null || !project?.tasks.some(task => task.uid === focusUid))) setFocusUid(null);
  }, [focusUid, selected, modal, project]);
  function updateTask(task: Task) { setProject(p => p && replaceTask(p, task)); }
  function reorder(uid: string, order: number) { setProject(p => p && moveTask(p, uid, order)); }
  function reorderSibling(uid: string, targetUid: string) {
    setProject(p => {
      if (!p) return p;
      try { return moveSiblingTask(p, uid, targetUid); }
      catch (error) { setMessage((error as Error).message); return p; }
    });
  }
  function updateParent(uid: string, parentUid: string | null) {
    if (!project) return;
    try { const next = reparentTask(project, uid, parentUid); setProject(next.project); setMessage(next.message); }
    catch (error) { setMessage((error as Error).message); }
  }
  function addDependency(from: string, to: string) {
    if (!project) return;
    try { setProject(addTaskDependency(project, from, to)); setMessage('依赖已添加，后续排期已更新。请保存并备份。'); }
    catch (error) { setMessage((error as Error).message); }
  }
  const relation = useRelationDrag(project, addDependency, (uid, parentUid) => updateParent(uid, parentUid), setMessage);
  function toggleCollapse(uid: string) {
    if (!project?.tasks.some(task => task.parent_uid === uid)) return;
    setProject(current => current && toggleTaskCollapse(current, uid));
    setSelected(uid); setMessage('子任务折叠状态已更新。请保存并备份。');
  }
  async function addTask() {
    if (!project || focusUid) return;
    try {
      const defaults = await api<TaskDefaults>('task-defaults');
      const next = createTask(project, defaults, crypto.randomUUID());
      setProject(next.project); setSelected(next.task.uid);
    } catch (error) { setMessage(`无法新建任务：${(error as Error).message}`); }
  }
  function removeTask() {
    if (!project || !selected) return;
    try {
      const next = deleteTask(project, selected);
      if (!confirm('删除此任务？修改将在保存并备份后写入文件。')) return;
      setProject(next); setSelected(null);
    } catch (error) { setMessage((error as Error).message); }
  }
  async function reload() {
    if (await reloadProject()) { setModal(null); setMessage('已重新加载文件。'); }
  }
  async function openBackups() { if (await loadBackups()) setModal('backups'); }
  async function selectProjectFile(name: string) {
    if (await loadProjectFile(name)) { setSelected(null); setModal(null); setMessage(`已加载项目：${name}`); }
  }
  async function restore(name: string) {
    if (await restoreBackup(name)) { setModal(null); setSelected(null); setMessage('已恢复备份；恢复前的文件也已备份。'); }
  }
  function exportInteractiveGantt() {
    if (!project || calculated.error) return;
    try {
      downloadInteractiveGanttHtml(project, { scale, filter, draft: dirty });
      setMessage(`已导出交互式甘特图${dirty ? '（包含当前未保存草稿）' : ''}。`);
    } catch (error) { setMessage(`导出失败：${(error as Error).message}`); }
  }
  if (!project) return <div className="loading"><span className="brand-icon">T</span><h1>TaskManager</h1><p>{fileError || '正在读取项目 YAML…'}</p><p className="muted">启动文件无效时，修复 YAML 后会自动重试。</p></div>;
  const allLabels = [...new Set([...project.tasks.flatMap(t => t.labels), ...filter.labels])].sort();
  const task = project.tasks.find(t => t.uid === selected);
  const late = [...calculated.schedule.values()].filter(s => s.late).length;
  const unknown = [...new Set([...calculated.schedule.values()].flatMap(s => s.unknownYears))].sort();
  return <div className={`app ${focusUid ? 'dependency-focus-active' : ''}`}>
    <header className="app-header">
      <div className="brand"><span className="brand-icon">T</span><div><strong>TaskManager</strong><small>让计划清晰可见</small></div></div>
      <nav aria-label="工作区导航">
        <span className="nav-active">任务排期</span>
        <button disabled={saving || !!focusUid} onClick={() => setModal('settings')}>项目设置</button>
        <button disabled={saving || !!focusUid} onClick={() => setModal('calendar')}>本地日历</button>
        <button disabled={saving || !!focusUid} onClick={openBackups}>备份历史</button>
      </nav>
      <div className="save-area">
        <button className="theme-toggle" type="button" disabled={saving || !!focusUid} aria-label={theme === 'light' ? '切换到暗色主题' : '切换到明亮主题'} aria-pressed={theme === 'dark'} onClick={() => setProject(current => current && { ...current, project: { ...current.project, theme: current.project.theme === 'light' ? 'dark' : 'light' } })}>{theme === 'light' ? '☾ 暗色' : '☀ 明亮'}</button>
        <span className={`save-state ${dirty ? 'unsaved' : ''}`} data-testid="save-state">{saving ? '正在保存…' : dirty ? '● 未保存修改' : '● 与 YAML 同步'}</span>
        <div className="header-actions" role="group" aria-label="项目操作">
          <button disabled={saving || !!focusUid} onClick={addTask}>＋ 新增任务</button>
          <button disabled={saving || !!focusUid || !!calculated.error} onClick={exportInteractiveGantt}>导出交互式 HTML</button>
          <button className="primary" disabled={saving || !!focusUid || !!calculated.error || conflict || !!fileError} onClick={save}>保存并备份 <kbd>Ctrl S</kbd></button>
        </div>
      </div>
    </header>
    <main>
      <div className="project-heading"><div><span className="eyebrow">PROJECT WORKSPACE</span><h1>{project.project.name}</h1><p className="muted">项目开始于 {project.project.start_date} · 以半天为最小排期单位</p></div></div>
      <div className="stats"><div><span>全部任务</span><strong>{String(project.tasks.length).padStart(2, '0')}</strong></div><div><span>进行中</span><strong>{String(project.tasks.filter(t => t.status === '进行中').length).padStart(2, '0')}</strong></div><div><span>已完成</span><strong>{String(project.tasks.filter(t => t.status === '已完成').length).padStart(2, '0')}</strong></div><div className={late ? 'stat-warning' : ''}><span>超期预警</span><strong>{String(late).padStart(2, '0')}</strong></div></div>
      {message && <div className="notice" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
      {fileError && <div className="alert" role="alert">磁盘文件读取失败：{fileError}。当前画面保留最近的有效数据，不能保存。</div>}
      {conflict && <div className="alert" role="alert">外部 YAML 已变化。已保留你的草稿，保存已暂停，避免覆盖外部修改。<button disabled={!!focusUid} onClick={reload}>重新加载外部文件</button></div>}
      {calculated.error && <div className="alert" role="alert">请修正数据后保存：{calculated.error}</div>}
      {unknown.length > 0 && <div className="calendar-warning">◷ 缺少 {unknown.join('、')} 年的有效日历，相关任务暂按普通周末排期。<button disabled={!!focusUid} onClick={() => setModal('calendar')}>管理本地日历 →</button></div>}
      <fieldset className="workspace-fieldset" disabled={saving}>
        <section className="board">
          <div className="project-file-bar"><label className="project-file-picker">项目文件<SearchableSelect label="选择项目文件" disabled={saving || !!focusUid || !projectFiles.length} value={snapshot?.file.split('/').pop() || ''} onChange={name => void selectProjectFile(name)} options={projectFiles.map(name => ({ value: name, label: name }))} /></label></div>
          <div className="board-toolbar"><div className="view-title"><h2>任务甘特图</h2><span className="badge">{project.tasks.length} TASKS</span></div><div className="scale-switch" aria-label="时间轴粒度">{scales.map((s, i) => <button disabled={!!focusUid} key={s} className={scale === s ? 'active' : ''} onClick={() => setScale(s)}>{scaleNames[i]}</button>)}</div></div>
          <div className="filter-toolbar"><span className="muted small">标签筛选</span><button disabled={!!focusUid} className={`tag ${!filter.labels.length ? 'selected' : ''}`} onClick={() => setFilter({ ...filter, labels: [] })}>全部</button>{allLabels.map(label => <button disabled={!!focusUid} className={`tag ${filter.labels.includes(label) ? 'selected' : ''}`} key={label} onClick={() => setFilter({ ...filter, labels: filter.labels.includes(label) ? filter.labels.filter(l => l !== label) : [...filter.labels, label] })}>{label}</button>)}<SearchableSelect label="标签匹配模式" disabled={!!focusUid} value={filter.mode} onChange={value => setFilter({ ...filter, mode: value as 'and' | 'or' })} options={[{ value: 'or', label: '任一匹配 OR' }, { value: 'and', label: '全部匹配 AND' }]} /><button disabled={!!focusUid} className="text-button default-view" onClick={() => { setProject({ ...project, project: { ...project.project, default_scale: scale, default_filter: filter } }); setMessage('当前粒度和筛选已设为项目默认值，等待保存。'); }}>设为默认视图</button></div>
          <Gantt project={project} schedule={calculated.schedule} dependencyEdges={calculated.dependencies} scale={scale} selected={selected} filter={filter} focusUid={focusUid} canFocus={selected === null && modal === null} onFocusChange={setFocusUid} onSelect={setSelected} onChange={updateTask} onOrder={reorder} onSiblingOrder={reorderSibling} onToggleCollapse={toggleCollapse} relation={relation} notify={setMessage} />
          <div className="board-footer"><div className="legend">{statuses.map(s => { const color = statusColorsByTheme[theme][s]; return <span key={s}><i style={{ backgroundColor: color.fill, borderColor: color.border }} />{s}</span>; })}<span><i className="late-key" />超期</span>{!project.project.allow_assignee_parallel_tasks && <span><i className="assignee-dependency-key" />同执行人串行</span>}</div><span>{focusUid ? '依赖聚焦模式 · 只读 · 松开 M 恢复' : '筛选时仅显示匹配任务及其父节点 · 悬浮任务按住 M 查看直接依赖'}</span></div>
        </section>
        {task && <TaskEditor key={`${task.uid}:${snapshot?.revision}`} task={task} project={project} scheduled={calculated.schedule.get(task.uid)} dependencyEdges={calculated.dependencies} relation={relation} onChange={updateTask} onParentChange={parent_uid => updateParent(task.uid, parent_uid)} onOrder={order => reorder(task.uid, order)} onDependency={addDependency} onAdd={addTask} onDelete={removeTask} onClose={() => setSelected(null)} />}
      </fieldset>
      <footer className="app-footer"><span className="mono" title={snapshot?.file}>{snapshot?.file}</span><span>本地优先 · YAML 数据源 · v0.1</span></footer>
    </main>
    {modal === 'calendar' && <CalendarPanel project={project} onChange={setProject} onClose={() => setModal(null)} notify={setMessage} />}
    {modal === 'settings' && <ProjectSettings project={project} onChange={setProject} onClose={() => setModal(null)} notify={setMessage} />}
    {modal === 'backups' && <div className="modal-backdrop"><section className="modal backups-modal" role="dialog" aria-modal="true" aria-label="备份历史"><div className="panel-heading"><div><span className="eyebrow">PROJECT SNAPSHOTS</span><h2>备份历史</h2></div><button disabled={saving} aria-label="关闭备份历史" onClick={() => setModal(null)}>×</button></div><p className="muted">时间戳使用 UTC。恢复前会备份当前磁盘文件；本地未保存草稿不会保留。</p>{!backups.length && <p className="empty">暂无备份。点击“保存并备份”创建第一个快照。</p>}<div className="backup-list">{backups.map(name => <div key={name}><span className="mono">{name}</span><button disabled={saving || conflict || !!fileError} onClick={() => restore(name)}>恢复</button></div>)}</div></section></div>}
  </div>;
}
