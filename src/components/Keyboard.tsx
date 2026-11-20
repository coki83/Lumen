// An on-screen keyboard for the couch: every key is reachable with the stick, A types it.
// Used by the Big Screen search, which opens with the Y button.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { playSound } from '../lib/sound';
import { captureText, type PadAction } from '../lib/gamepad';

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ':', '-', '.']
];
const LAST = ['shift', 'space', 'back', 'clear'] as const;

export interface KeyboardHandle {
  /** Returns true when the key press was used by the keyboard. */
  action(a: PadAction): boolean;
}

/**
 * The keys are laid out as a grid, so moving around them is plain row and column maths
 * rather than measuring the page. The caller feeds it controller presses.
 */
export function useKeyboard(onChange: (fn: (text: string) => string) => void, onClose: () => void, active = true): [KeyboardHandle, JSX.Element] {
  const [pos, setPos] = useState({ r: 1, c: 0 });
  const [shift, setShift] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const shiftRef = useRef(shift);
  shiftRef.current = shift;

  const press = (r: number, c: number) => {
    if (r < ROWS.length) {
      const ch = ROWS[r][c];
      const out = shiftRef.current ? ch.toUpperCase() : ch;
      setShift(false);
      onChange((t) => t + out);
      playSound('select');
      return;
    }
    const key = LAST[Math.min(LAST.length - 1, Math.floor((c / 10) * LAST.length))];
    if (key === 'shift') setShift((s) => !s);
    else if (key === 'space') onChange((t) => t + ' ');
    else if (key === 'back') onChange((t) => t.slice(0, -1));
    else onChange(() => '');
    playSound(key === 'back' ? 'back' : 'select');
  };

  const handle: KeyboardHandle = {
    action(a) {
      const { r, c } = posRef.current;
      if (a === 'left') { setPos({ r, c: (c + 9) % 10 }); playSound('move'); return true; }
      if (a === 'right') { setPos({ r, c: (c + 1) % 10 }); playSound('move'); return true; }
      if (a === 'up') { setPos({ r: (r + ROWS.length) % (ROWS.length + 1), c }); playSound('move'); return true; }
      if (a === 'down') { setPos({ r: (r + 1) % (ROWS.length + 1), c }); playSound('move'); return true; }
      if (a === 'a') { press(r, c); return true; }
      if (a === 'x') { onChange((t) => t.slice(0, -1)); playSound('back'); return true; }
      if (a === 'lb') { setShift((s) => !s); return true; }
      if (a === 'rb') { onChange((t) => t + ' '); return true; }
      if (a === 'b') { onClose(); return true; }
      return false;
    }
  };

  // A real keyboard still works, which is what most people will use on a desk.
  useEffect(() => {
    if (!active) return;
    captureText(true);
    return () => captureText(false);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length === 1) { onChange((t) => t + e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { onChange((t) => t.slice(0, -1)); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, active]);

  const cell = (r: number, c: number, label: React.ReactNode, wide = false) => (
    <button key={`${r}-${c}`} className={`vk-key ${wide ? 'wide' : ''} ${pos.r === r && (r < ROWS.length ? pos.c === c : Math.floor((pos.c / 10) * LAST.length) === c) ? 'on' : ''}`}
      onClick={() => { setPos({ r, c: r < ROWS.length ? c : Math.round((c / LAST.length) * 10) }); press(r, r < ROWS.length ? c : Math.round((c / LAST.length) * 10)); }}>
      {label}
    </button>
  );

  const view = (
    <div className="vk">
      {ROWS.map((row, r) => (
        <div key={r} className="vk-row">{row.map((ch, c) => cell(r, c, shift ? ch.toUpperCase() : ch))}</div>
      ))}
      <div className="vk-row">
        {cell(ROWS.length, 0, <><span className="vk-caps">⇧</span> {shift ? 'CAPS' : 'Caps'}</>, true)}
        {cell(ROWS.length, 1, 'Space', true)}
        {cell(ROWS.length, 2, <><Icon name="close" size={16} /> Delete</>, true)}
        {cell(ROWS.length, 3, 'Clear', true)}
      </div>
    </div>
  );

  return [handle, view];
}
