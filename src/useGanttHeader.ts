import { useLayoutEffect, useRef, type RefObject } from 'react';

/** The header sticks to the page, outside the horizontal scrollport.
 * A native scroll timeline keeps its dates aligned without React scroll updates.
 * Older browsers synchronize the date strip directly, never moving the fixed corner.
 */
export function useGanttHeader(scroll: RefObject<HTMLDivElement | null>, width: number, listWidth: number, viewportWidth: number) {
  const axis = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const source = scroll.current, target = axis.current;
    if (!source || !target) return;
    const native = CSS.supports('animation-timeline', '--gantt-horizontal') && CSS.supports('timeline-scope', '--gantt-horizontal');
    target.dataset.nativeScroll = String(native);
    const sync = () => { target.style.transform = `translateX(${-source.scrollLeft}px)`; };
    const resize = () => {
      target.style.setProperty('--gantt-scroll-distance', `${Math.max(0, source.scrollWidth - source.clientWidth)}px`);
      if (!native) sync();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(source);
    if (source.firstElementChild) observer.observe(source.firstElementChild);
    if (!native) source.addEventListener('scroll', sync, { passive: true });
    return () => { observer.disconnect(); source.removeEventListener('scroll', sync); };
  }, [scroll, width, listWidth, viewportWidth]);
  return axis;
}
