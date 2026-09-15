import type { Project, Task } from './model';

export type GanttTreeItem = { task: Task; depth: number; top: number; height: number; isParent: boolean };
export type GanttTreeLayout = { items: GanttTreeItem[]; height: number };

const LEAF_HEIGHT = 42;
const SIBLING_GAP = 6;
// Reserve one normal row for a parent label before placing its children.  This
// lets the left tree list share the exact same row origins as the task bars.
const PARENT_HEADER_HEIGHT = LEAF_HEIGHT + SIBLING_GAP;

/** Assigns a vertical rectangle to every task; parent rectangles enclose descendants. */
export function ganttTreeLayout(project: Project): GanttTreeLayout {
  const children = new Map<string | null, Task[]>();
  for (const task of project.tasks) {
    const value = children.get(task.parent_uid) ?? [];
    value.push(task); children.set(task.parent_uid, value);
  }
  for (const value of children.values()) value.sort((a, b) => a.order - b.order);
  const items: GanttTreeItem[] = [];
  let cursor = 0;
  function place(task: Task, depth: number): GanttTreeItem {
    const descendants = children.get(task.uid) ?? [];
    const top = cursor;
    const item: GanttTreeItem = { task, depth, top, height: LEAF_HEIGHT, isParent: descendants.length > 0 };
    items.push(item);
    if (!descendants.length) { cursor += LEAF_HEIGHT + SIBLING_GAP; return item; }
    cursor += PARENT_HEADER_HEIGHT;
    for (const child of descendants) place(child, depth + 1);
    item.height = Math.max(PARENT_HEADER_HEIGHT + LEAF_HEIGHT, cursor - top);
    cursor += SIBLING_GAP;
    return item;
  }
  for (const root of children.get(null) ?? []) place(root, 0);
  return { items, height: Math.max(0, cursor - SIBLING_GAP) };
}
