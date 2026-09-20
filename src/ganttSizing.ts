/**
 * Shared vertical sizing for both the editable Gantt and the offline export.
 * Change these three values to tune the density of every task row.
 */
export const GANTT_SIZING = {
  rowHeight: 36,
  barHeight: 26,
  rowGap: 3,
} as const;

export const GANTT_ROW_STRIDE = GANTT_SIZING.rowHeight + GANTT_SIZING.rowGap;
export const GANTT_BAR_TOP = (GANTT_SIZING.rowHeight - GANTT_SIZING.barHeight) / 2;
export const GANTT_PARENT_INSET = GANTT_SIZING.rowGap;
export const GANTT_PARENT_MIN_HEIGHT = GANTT_SIZING.rowHeight - GANTT_PARENT_INSET * 2;
