import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject, type UIEvent } from 'react';
import type { Scale } from './model';
import { pixelsPerDay } from './timeline';
import { GANTT_ZOOM_LEVELS, normalizeGanttZoom } from './ganttZoom';

/** Owns horizontal zoom, task-list width, scrolling and canvas panning. */
export function useGanttViewport({ scale, origin, focusUid, onSelect, skipClick }: {
  scale: Scale;
  origin: number;
  focusUid: string | null;
  onSelect: (uid: string | null) => void;
  skipClick: RefObject<boolean>;
}) {
  const [taskListWidth, setTaskListWidth] = useState(260);
  const [viewportWidth, setViewportWidth] = useState(1360);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ x: number; width: number } | null>(null);
  const panRef = useRef<{ x: number; scrollLeft: number; moved: boolean } | null>(null);
  const zoomAnchorRef = useRef<number | null>(null);
  const ppd = pixelsPerDay[scale] * zoom;
  const pps = ppd / 2;
  useEffect(() => {
    const node = scroll.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const update = () => setViewportWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = scroll.current, anchorSlot = zoomAnchorRef.current;
    if (!node || anchorSlot === null) return;
    zoomAnchorRef.current = null;
    const visibleTimelineWidth = Math.max(0, node.clientWidth - taskListWidth);
    node.scrollLeft = Math.max(0, (anchorSlot - origin * 2) * pps - visibleTimelineWidth / 2);
  }, [zoom, origin, pps, taskListWidth]);
  function changeZoom(next: number) {
    const target = normalizeGanttZoom(next);
    if (target === zoom) return;
    const node = scroll.current;
    if (node) {
      const visibleTimelineWidth = Math.max(0, node.clientWidth - taskListWidth);
      zoomAnchorRef.current = origin * 2 + (node.scrollLeft + visibleTimelineWidth / 2) / pps;
    }
    setZoom(target);
  }
  const zoomIndex = Math.max(0, GANTT_ZOOM_LEVELS.indexOf(zoom as typeof GANTT_ZOOM_LEVELS[number]));
  function beginListResize(e: ReactPointerEvent<HTMLSpanElement>) {
    if (focusUid) return;
    e.preventDefault();
    resizeRef.current = { x: e.clientX, width: taskListWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function resizeList(e: ReactPointerEvent<HTMLSpanElement>) {
    const start = resizeRef.current;
    if (start) setTaskListWidth(Math.max(190, Math.min(520, start.width + e.clientX - start.x)));
  }
  function finishListResize(e: ReactPointerEvent<HTMLSpanElement>) {
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function beginPan(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement, taskTarget = target.closest<HTMLElement>('[data-task-uid]');
    if (e.button !== 0 || target.closest('button, .task-list-resize-handle, .tree-task-labels') || (taskTarget && !taskTarget.classList.contains('parent-task-bar'))) return;
    panRef.current = { x: e.clientX, scrollLeft: e.currentTarget.scrollLeft, moved: false };
    onSelect(null); e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  }
  function beginParentPan(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !scroll.current) return;
    panRef.current = { x: e.clientX, scrollLeft: scroll.current.scrollLeft, moved: false };
    onSelect(null); scroll.current.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault();
  }
  function beginFocusPan(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !scroll.current) return;
    panRef.current = { x: e.clientX, scrollLeft: scroll.current.scrollLeft, moved: false };
    scroll.current.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault();
  }
  function pan(e: ReactPointerEvent<HTMLDivElement>) {
    const start = panRef.current;
    if (start && scroll.current) {
      if (Math.abs(e.clientX - start.x) > 4) { start.moved = true; skipClick.current = true; }
      scroll.current.scrollLeft = start.scrollLeft - (e.clientX - start.x);
    }
  }
  function finishPan(e: ReactPointerEvent<HTMLDivElement>) {
    panRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return { taskListWidth, viewportWidth, zoom, scrollLeft, scroll, ppd, pps, zoomIndex,
    changeZoom, beginListResize, resizeList, finishListResize,
    beginPan, beginParentPan, beginFocusPan, pan, finishPan,
    onScroll: (event: UIEvent<HTMLDivElement>) => setScrollLeft(event.currentTarget.scrollLeft) };
}
