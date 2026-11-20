// "Nobody has touched anything for a while" — used by the screensaver.
// Mouse, keyboard and touch are easy; a controller needs polling, because a stick held still
// still counts as no activity and a sleeping pad sends no events at all.
import { useEffect, useRef, useState } from 'react';

function padSignature(): string {
  let out = '';
  for (const p of navigator.getGamepads?.() ?? []) {
    if (!p) continue;
    out += p.buttons.map((b) => (b.pressed ? 1 : 0)).join('');
    out += p.axes.map((a) => Math.round(a * 4)).join(',');
  }
  return out;
}

/** True once nothing has happened for `ms`. Any input resets it. */
export function useIdle(ms: number, enabled = true): boolean {
  const [idle, setIdle] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    if (!enabled || ms <= 0) {
      setIdle(false);
      return;
    }
    let sig = padSignature();
    const wake = () => {
      last.current = Date.now();
      setIdle((was) => (was ? false : was));
    };
    const events = ['mousemove', 'mousedown', 'wheel', 'keydown', 'touchstart', 'pointerdown'] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    const tick = window.setInterval(() => {
      const now = padSignature();
      if (now !== sig) {
        sig = now;
        wake();
        return;
      }
      if (Date.now() - last.current >= ms) setIdle(true);
    }, 500);
    return () => {
      for (const e of events) window.removeEventListener(e, wake);
      window.clearInterval(tick);
    };
  }, [ms, enabled]);

  return idle;
}
