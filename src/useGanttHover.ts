import { useCallback, useEffect, useRef, useState } from 'react';

export type TaskHover = { uid: string; x: number; y: number };

/** Hover remains enabled in M focus mode. Only active drags suspend previews.
 * Leaving a task delays dismissal so users can cross the gap to a scrollable card.
 */
export function useGanttHover(suspended: boolean) {
  const [hover, setHover] = useState<TaskHover | null>(null);
  const hoverRef = useRef<TaskHover | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rowDragging = useRef(false), suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const keepHover = useCallback(() => { clearTimeout(timer.current); }, []);
  const clearHover = useCallback(() => {
    keepHover(); hoverRef.current = null; setHover(null);
  }, [keepHover]);
  const updateHover = useCallback((value: TaskHover | null) => {
    keepHover();
    if (rowDragging.current || suspendedRef.current) return;
    if (value) { hoverRef.current = value; setHover(value); }
    else timer.current = setTimeout(clearHover, 180);
  }, [keepHover, clearHover]);
  const beginRowDrag = useCallback(() => { rowDragging.current = true; clearHover(); }, [clearHover]);
  const resetHoverState = useCallback(() => { rowDragging.current = false; clearHover(); }, [clearHover]);
  useEffect(() => { if (suspended) clearHover(); }, [suspended, clearHover]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) resetHoverState(); };
    window.addEventListener('blur', resetHoverState);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      keepHover();
      window.removeEventListener('blur', resetHoverState);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [keepHover, resetHoverState]);
  return { hover, hoverRef, updateHover, keepHover, clearHover, beginRowDrag, resetHoverState };
}
