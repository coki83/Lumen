// Is Lumen the window you are looking at right now?
//
// A game that starts over Big Screen does not hide Lumen's window, it only takes the focus,
// so `document.hidden` stays false. Everything that should go quiet behind a game (the music,
// the live wallpaper) asks here instead.
import { useEffect, useState } from 'react';

let active = typeof document === 'undefined' ? true : !document.hidden && document.hasFocus();
const listeners = new Set<(on: boolean) => void>();

function set(on: boolean) {
  if (on === active) return;
  active = on;
  for (const l of listeners) l(on);
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => set(!document.hidden));
  window.addEventListener('blur', () => set(false));
  document.addEventListener('visibilitychange', () => set(!document.hidden && document.hasFocus()));
}

export function isAppActive(): boolean {
  return active;
}

export function useAppActive(): boolean {
  const [on, setOn] = useState(active);
  useEffect(() => {
    setOn(active);
    listeners.add(setOn);
    return () => { listeners.delete(setOn); };
  }, []);
  return on;
}
