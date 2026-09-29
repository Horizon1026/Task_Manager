/** Observe both the capped viewport and its uncapped content; content can grow
 * without resizing the outer card. Shared by React and the offline HTML viewer.
 */
export function observeFloatingCard(card: HTMLElement, content: HTMLElement, x: number, y: number): () => void {
  let frame: number | undefined, disposed = false;
  const place = () => {
    frame = undefined;
    if (disposed) return;
    card.classList.toggle('scrollable', card.scrollHeight > card.clientHeight);
    const rect = card.getBoundingClientRect();
    card.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - rect.width - 8))}px`;
    card.style.top = `${Math.max(8, Math.min(y + 18, window.innerHeight - rect.height - 8))}px`;
  };
  const schedule = () => {
    if (!disposed && frame === undefined) frame = requestAnimationFrame(place);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(card); observer.observe(content);
  window.addEventListener('resize', schedule);
  document.fonts.addEventListener('loadingdone', schedule);
  void document.fonts.ready.then(schedule);
  place();
  return () => {
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    document.fonts.removeEventListener('loadingdone', schedule);
  };
}
