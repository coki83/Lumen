import { useEffect } from 'react';

/** App-wide commands, fired by shortcuts and listened to by the views. */
export const sendCommand = (cmd: string) => window.dispatchEvent(new CustomEvent('lumen:cmd', { detail: cmd }));
export function useCommand(handler: (cmd: string) => void) {
  useEffect(() => {
    const h = (e: Event) => handler((e as CustomEvent).detail);
    window.addEventListener('lumen:cmd', h);
    return () => window.removeEventListener('lumen:cmd', h);
  });
}
