import type { GanttTreeItem } from './ganttLayout';

export function GanttTaskLabel({ item, isParent, listWidth, selected, dimmed, locked, total, onHover, onSelect, onOrder, onSiblingOrder, onToggleCollapse }: {
  item: GanttTreeItem;
  isParent: boolean;
  listWidth: number;
  selected: string | null;
  dimmed: boolean;
  locked: boolean;
  total: number;
  onHover: (value: { uid: string; x: number; y: number } | null) => void;
  onSelect: (uid: string) => void;
  onOrder: (uid: string, order: number) => void;
  onSiblingOrder: (uid: string, targetUid: string) => void;
  onToggleCollapse: (uid: string) => void;
}) {
  const task = item.task, top = item.top + (isParent ? 4 : 6);
  return <div className={`gantt-row tree-task-cell ${isParent ? 'tree-parent-cell' : ''} ${selected === task.uid ? 'selected-row' : ''} ${dimmed ? 'muted-row' : ''}`} data-task-uid={task.uid} style={{ top, height: 30, width: listWidth, paddingLeft: 8 + item.depth * 18, zIndex: item.depth + 6 }} onMouseEnter={e => onHover({ uid: task.uid, x: e.clientX, y: e.clientY })} onMouseLeave={() => onHover(null)} onDoubleClick={e => { if (locked || !isParent || (e.target as HTMLElement).closest('.row-order, .row-grip')) return; e.preventDefault(); onToggleCollapse(task.uid); }} onDragOver={e => { if (!locked) e.preventDefault(); }} onDrop={e => { if (locked) return; const uid = e.dataTransfer.getData('text/mission-uid'); if (uid) { e.preventDefault(); onSiblingOrder(uid, task.uid); } }}>
    <span className="tree-branch">{isParent ? task.collapse_children ? '▸' : '▾' : item.depth ? '└' : ''}</span>
    <span className="row-grip" draggable={!locked} onDragStart={e => { if (locked) return e.preventDefault(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/mission-uid', task.uid); }}>⠿</span>
    <span className="row-number" title={task.uid}>{task.uid}</span>
    <button className="task-title" disabled={locked} title={isParent ? '双击折叠或展开子任务' : undefined} onClick={() => { if (!locked) onSelect(task.uid); }}><strong>{task.name}</strong>{!isParent && <span className="task-assignee">{task.assignee || '未指定执行人'}</span>}</button>
    <div className="row-order"><button aria-label={`上移 ${task.name}`} disabled={locked || task.order === 1} onClick={() => onOrder(task.uid, task.order - 1)}>↑</button><button aria-label={`下移 ${task.name}`} disabled={locked || task.order === total} onClick={() => onOrder(task.uid, task.order + 1)}>↓</button></div>
  </div>;
}
