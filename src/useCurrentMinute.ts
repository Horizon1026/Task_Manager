import { useEffect, useState } from 'react';
import { millisecondsUntilNextMinute } from './dateCalendar';

/** Update timeline markers at each local minute, including after tab resume. */
export function useCurrentMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => { setNow(new Date()); schedule(); }, millisecondsUntilNextMinute());
    };
    const refresh = () => {
      window.clearTimeout(timer);
      setNow(new Date());
      schedule();
    };
    schedule();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return now;
}
