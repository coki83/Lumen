import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePad, type PadAction } from './gamepad';
import { playSound } from './sound';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Everything inside a window that you can land on with the stick. */
const SEL = 'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The closest control in that direction.
 *
 * Anything that still shares a line with you wins, however far along it is: pushing right from a
 * theme card has to reach the card beside it, not a swatch one row down that happens to start a
 * few pixels further right. Only when nothing on this line lies that way does it leave the line,
 * and then a step straight ahead beats one off to the side.
 */
export function nearest(cur: HTMLElement, list: HTMLElement[], dir: Dir): HTMLElement | null {
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const vert = dir === 'up' || dir === 'down';
  let best: { el: HTMLElement; inLine: boolean; score: number; across: number } | null = null;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    // Its middle has to be the way you pushed, so a tall neighbour you overlap is not "ahead".
    const middle = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (middle < 4) continue;
    // Edge to edge along the push, never below zero for things that overlap you.
    const gap = Math.max(0, dir === 'left' ? a.left - b.right : dir === 'right' ? b.left - a.right : dir === 'up' ? a.top - b.bottom : b.top - a.bottom);
    const across = Math.abs(vert ? dx : dy);
    // Sharing a line means the two overlap across the push by a quarter of the smaller one.
    const over = vert
      ? Math.min(a.right, b.right) - Math.max(a.left, b.left)
      : Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const inLine = over > Math.max(6, Math.min(vert ? a.width : a.height, vert ? b.width : b.height) * 0.25);
    const score = inLine ? gap : gap + across * 3;
    if (!best || (inLine && !best.inLine) || (inLine === best.inLine && (score < best.score || (score === best.score && across < best.across)))) {
      best = { el, inLine, score, across };
    }
  }
  return best?.el ?? null;
}

/** Changes a slider or a dropdown in place, the way React expects, so left and right work on them. */
function nudge(el: HTMLElement, step: number): boolean {
  if (el instanceof HTMLInputElement && el.type === 'range') {
    const s = Number(el.step) || 1;
    const v = Math.min(Number(el.max || 100), Math.max(Number(el.min || 0), Number(el.value) + step * s));
    if (v === Number(el.value)) return true;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + step));
    if (i === el.selectedIndex) return true;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, el.options[i].value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

const typing = (el: Element | null) => el instanceof HTMLInputElement && ['text', 'url', 'number', 'password', 'search'].includes(el.type) || el instanceof HTMLTextAreaElement;

/**
 * Lets a controller (and the same keys) move through a window: the stick picks the next control,
 * A presses it, left and right slide sliders and dropdowns, the bumpers switch tabs, B goes back.
 */
export function useWindowNav(root: RefObject<HTMLElement | null>, onBack: () => void, active = true) {
  const cur = useRef<HTMLElement | null>(null);
  const [pad, setPad] = useState(false);

  const set = (el: HTMLElement | null) => {
    cur.current?.classList.remove('knav');
    cur.current = el;
    if (el) { el.classList.add('knav'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  };
  useEffect(() => () => set(null), []);
  // Land on the first control as soon as the window opens, so the first press of the stick
  // already moves instead of only lighting something up.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => {
      if (cur.current?.isConnected || !root.current) return;
      const all = items();
      if (all.length) set(root.current.querySelector<HTMLElement>('.settings-tabs .nav-item.on') ?? all.find((e) => !e.closest('.modal > header')) ?? all[0]);
    }, 60);
    return () => clearTimeout(id);
  }, [active]);
  useEffect(() => {
    const clear = () => { if (cur.current && !typing(document.activeElement)) set(null); }; // the mouse takes over
    window.addEventListener('mousemove', clear, { passive: true });
    return () => window.removeEventListener('mousemove', clear);
  }, []);

  const items = () => (root.current ? [...root.current.querySelectorAll<HTMLElement>(SEL)].filter((e) => e.offsetParent !== null && !e.hasAttribute('data-nav-skip')) : []);

  usePad((a: PadAction) => {
    if (!root.current) return;
    const all = items();
    if (!all.length) return;
    const here = cur.current?.isConnected ? cur.current : null;
    const first = () => (root.current?.querySelector<HTMLElement>('.settings-tabs .nav-item.on') ?? all.find((e) => !e.closest('.modal > header')) ?? all[0]);
    if (typing(document.activeElement) && a !== 'b') return; // let the keyboard finish the text first
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
      if (!here) { set(first()); playSound('move'); return; }
      if ((a === 'left' || a === 'right') && nudge(here, a === 'right' ? 1 : -1)) { playSound('move'); return; }
      // Up and down stay in the column you are in; only left and right cross between the tabs and the page.
      const side = (e: HTMLElement) => !!e.closest('.settings-tabs, .modal > header');
      const pool = a === 'up' || a === 'down' ? all.filter((e) => side(e) === side(here)) : all;
      // Nothing above or below in this column means you are at its edge: stay put rather than
      // jumping across to the other column, which feels like the wrong direction.
      const next = nearest(here, pool, a);
      if (next) { set(next); playSound('move'); }
      return;
    }
    if (a === 'a') {
      if (!here) { set(first()); return; }
      if (typing(here)) { here.focus(); return; }
      playSound('select');
      here.click();
      setTimeout(() => { if (here.isConnected) set(here); else set(items()[0] ?? null); }, 0);
      return;
    }
    if (a === 'b') {
      if (typing(document.activeElement)) return (document.activeElement as HTMLElement).blur();
      playSound('back');
      onBack();
      return;
    }
    if (a === 'lb' || a === 'rb') {
      const tabs = [...root.current.querySelectorAll<HTMLElement>('.settings-tabs .nav-item, .tabs button')];
      if (!tabs.length) return;
      const i = Math.max(0, tabs.findIndex((t) => t.classList.contains('on')));
      const next = tabs[(i + (a === 'rb' ? 1 : tabs.length - 1)) % tabs.length];
      next?.click();
      playSound('move');
      setTimeout(() => set(next ?? null), 0);
    }
  }, active, setPad);

  return pad;
}
