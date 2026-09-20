export const GANTT_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4] as const;

export function normalizeGanttZoom(value: number) {
  return GANTT_ZOOM_LEVELS.includes(value as typeof GANTT_ZOOM_LEVELS[number]) ? value : 1;
}
