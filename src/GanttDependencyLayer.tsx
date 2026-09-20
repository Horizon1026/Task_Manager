import type { DisplayDependencyEdge, GanttTreeItem } from './ganttLayout';
import { GANTT_SIZING } from './ganttSizing';
import { dependencyCurve } from './ganttGeometry';
import type { Scheduled } from './schedule';

export function GanttDependencyLayer({ edges, schedule, itemsByUid, activeUid, width, height, left, slotToX }: {
  edges: DisplayDependencyEdge[];
  schedule: Map<string, Scheduled>;
  itemsByUid: Map<string, GanttTreeItem>;
  activeUid: string | null;
  width: number;
  height: number;
  left: number;
  slotToX: (slot: number) => number;
}) {
  return <svg className="dependency-layer" width={width} height={height} style={{ left }}>
    <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
    {edges.filter(edge => edge.from === activeUid || edge.to === activeUid).map(edge => {
      const fromSchedule = schedule.get(edge.from), toSchedule = schedule.get(edge.to);
      const fromItem = itemsByUid.get(edge.from), toItem = itemsByUid.get(edge.to);
      if (!fromSchedule || !toSchedule || !fromItem || !toItem) return null;
      const curve = dependencyCurve(
        { x: slotToX(fromSchedule.end), y: fromItem.top + GANTT_SIZING.rowHeight / 2 },
        { x: slotToX(toSchedule.start), y: toItem.top + GANTT_SIZING.rowHeight / 2 },
      );
      const kindClass = edge.kind === 'assignee' ? 'assignee-dependency' : 'explicit-dependency';
      return <g key={`${edge.from}-${edge.to}`}>
        <path className={`dependency-arrow ${kindClass}`} d={curve.path} />
        <line className={`dependency-arrowhead ${kindClass}`} x1={curve.arrowStart.x} y1={curve.arrowStart.y} x2={curve.arrowEnd.x} y2={curve.arrowEnd.y} markerEnd="url(#arrow)" />
      </g>;
    })}
  </svg>;
}
