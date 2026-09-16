import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Project, Task } from './model';
import { setTaskParent } from './schedule';

export type RelationDrag = { uid: string; mode: 'dependency' | 'parent'; x: number; y: number; dx: number; dy: number; moved: boolean; target?: string };
export type RelationDragController = {
  drag: RelationDrag | null;
  parentError: string;
  begin: (event: ReactPointerEvent<HTMLElement>, task: Task) => boolean;
  move: (event: ReactPointerEvent<HTMLElement>) => boolean;
  finish: (event: ReactPointerEvent<HTMLElement>) => boolean;
  cancel: () => void;
};

const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-task-uid]')?.dataset.taskUid;

/** One relation gesture shared by Gantt bars and the task-detail drag handle. */
export function useRelationDrag(project: Project | null, onDependency: (from: string, to: string) => void,
  onParentChange: (uid: string, parentUid: string) => void, notify: (message: string) => void): RelationDragController {
  const [drag, setDrag] = useState<RelationDrag | null>(null);
  const dragRef = useRef<RelationDrag | null>(null), parentKey = useRef(false);
  const live = useRef({ project, onDependency, onParentChange, notify });
  live.current = { project, onDependency, onParentChange, notify };
  function cancel() { dragRef.current = null; setDrag(null); }
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) cancel();
      const target = event.target;
      if (event.key.toLowerCase() === 'r' && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey
        && target instanceof HTMLElement && !target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) parentKey.current = true;
    };
    const up = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'r') parentKey.current = false; };
    const blur = () => { parentKey.current = false; cancel(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  const parentError = useMemo(() => {
    if (!project || drag?.mode !== 'parent' || !drag.target) return '';
    try { setTaskParent(project, drag.uid, drag.target); return ''; }
    catch (error) { return (error as Error).message; }
  }, [project, drag?.mode, drag?.uid, drag?.target]);
  function begin(event: ReactPointerEvent<HTMLElement>, task: Task) {
    if (event.button !== 2 || !live.current.project) return false;
    const parentMode = parentKey.current;
    const isParent = live.current.project.tasks.some(value => value.parent_uid === task.uid);
    if (isParent && !parentMode) return false;
    event.preventDefault(); event.stopPropagation();
    const value: RelationDrag = { uid: task.uid, mode: parentMode ? 'parent' : 'dependency', x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
    dragRef.current = value; setDrag(value); event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = dragRef.current; if (!current) return false;
    const value = { ...current, target: targetAt(event.clientX, event.clientY), dx: event.clientX - current.x, dy: event.clientY - current.y,
      moved: current.moved || Math.abs(event.clientX - current.x) + Math.abs(event.clientY - current.y) > 4 };
    dragRef.current = value; setDrag(value); return true;
  }
  function finish(event: ReactPointerEvent<HTMLElement>) {
    const value = dragRef.current; if (!value) return false;
    cancel();
    if (!value.moved) return true;
    const target = targetAt(event.clientX, event.clientY);
    if (!target) {
      live.current.notify(value.mode === 'parent' ? '已取消设置父任务：请拖到目标任务上。' : '已取消：请将箭头拖到目标任务上。');
    } else if (value.mode === 'parent') live.current.onParentChange(value.uid, target);
    // Drag the dependent task to its prerequisite; the stored edge remains prerequisite -> dependent.
    else live.current.onDependency(target, value.uid);
    return true;
  }
  return { drag, parentError, begin, move, finish, cancel };
}
