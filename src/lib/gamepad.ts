import { useEffect, useRef, useState } from 'react';
import { DEFAULT_KEYS, DEFAULT_PAD } from '../../shared/bindings';
import { api } from './api';

export type PadAction = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'start' | 'select';

let BUTTONS: Record<number, PadAction> = {};
let KEYS: Record<string, PadAction> = {};

/** Rebuild the lookup tables from the user's bindings (Settings → Controls). */
export function setInputBindings(keys: Record<string, string[]>, pads: Record<string, number[]>) {
  const k: Record<string, PadAction> = {};
  const b: Record<number, PadAction> = {};
  for (const [action, list] of Object.entries(keys)) for (const key of list) k[key.length === 1 ? key.toLowerCase() : key] = action as PadAction;
  for (const [action, list] of Object.entries(pads)) for (const i of list) b[i] = action as PadAction;
  KEYS = k;
  BUTTONS = b;
}
setInputBindings(DEFAULT_KEYS, DEFAULT_PAD);

/** Resolves with the next controller button pressed (for rebinding), or -1 after a timeout. */
export function capturePadButton(timeoutMs = 6000): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const before = new Set<number>();
    for (const p of navigator.getGamepads?.() ?? []) p?.buttons.forEach((b, i) => b.pressed && before.add(i));
    const tick = () => {
      for (const p of navigator.getGamepads?.() ?? []) {
        if (!p) continue;
        const i = p.buttons.findIndex((b, idx) => b.pressed && !before.has(idx));
        if (i >= 0) return resolve(i);
      }
      if (performance.now() - start > timeoutMs) return resolve(-1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let typing = false;
/** While the on-screen keyboard is open, letters belong to the text, not to the menu. */
export function captureText(on: boolean) {
  typing = on;
}

let quietUntil = 0;
/** Ignores controller and key presses for a moment, so the press that wakes the screen does nothing else. */
export function suppressInput(ms: number) {
  quietUntil = performance.now() + ms;
}

const REPEAT_DELAY = 380;
const REPEAT_RATE = 110;
const DEAD = 0.5;

/**
 * Calls `onAction` for controller buttons and the matching keys. Directions auto-repeat while held,
 * like a TV menu. Returns whether a controller is connected through the `connected` callback.
 */
export function usePad(onAction: (a: PadAction) => void, enabled = true, onConnected?: (on: boolean) => void) {
  const cb = useRef(onAction);
  cb.current = onAction;
  const conn = useRef(onConnected);
  conn.current = onConnected;

  useEffect(() => {
    if (!enabled) return;
    const held = new Map<PadAction, { since: number; last: number }>();
    let raf = 0;
    let wasConnected = false;
    let first = true; // buttons already held when this opens (e.g. the one that opened it) don't count

    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const active = new Set<PadAction>();
      let any = false;
      for (const p of pads) {
        if (!p) continue;
        any = true;
        p.buttons.forEach((b, i) => {
          const a = BUTTONS[i];
          if (a && (b.pressed || b.value > 0.6)) active.add(a);
        });
        const [x = 0, y = 0] = p.axes;
        if (x < -DEAD) active.add('left');
        if (x > DEAD) active.add('right');
        if (y < -DEAD) active.add('up');
        if (y > DEAD) active.add('down');
      }
      if (any !== wasConnected) {
        wasConnected = any;
        conn.current?.(any);
      }
      const now = performance.now();
      if (first) {
        first = false;
        for (const a of active) held.set(a, { since: now, last: now });
      }
      if (performance.now() < quietUntil) {
        for (const a of active) held.set(a, { since: now, last: now });
        raf = requestAnimationFrame(poll);
        return;
      }
      for (const a of active) {
        const h = held.get(a);
        if (!h) {
          held.set(a, { since: now, last: now });
          cb.current(a);
        } else if (['up', 'down', 'left', 'right'].includes(a) && now - h.since > REPEAT_DELAY && now - h.last > REPEAT_RATE) {
          h.last = now;
          cb.current(a);
        }
      }
      for (const a of [...held.keys()]) if (!active.has(a)) held.delete(a);
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    const onKey = (e: KeyboardEvent) => {
      if (performance.now() < quietUntil) return;
      if (typing && (e.key.length === 1 || e.key === 'Backspace')) return; // the keyboard takes those
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return; // app shortcuts, not navigation
      const a = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!a) return;
      e.preventDefault();
      cb.current(a);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}

// --- Which controller is plugged in ------------------------------------------------------

/** Makers we can name from the USB vendor id in a pad's own id string. */
const MAKERS: Record<string, string> = {
  '045e': 'Xbox controller', '054c': 'PlayStation controller', '057e': 'Nintendo controller',
  '28de': 'Steam controller', '2dc8': '8BitDo controller', '0f0d': 'Hori controller',
  '24c6': 'PowerA controller', '146b': 'Nacon controller', '20d6': 'PowerA controller',
  '1532': 'Razer controller', '0e6f': 'PDP controller', '1038': 'SteelSeries controller'
};

/**
 * A pad's `id` is written for programs, not for people: "Wireless Controller (STANDARD GAMEPAD
 * Vendor: 054c Product: 09cc)". This keeps the part a person would recognise, and falls back to
 * the maker, then to a plain description, rather than showing anyone a string of hex.
 */
/**
 * Windows hands every XInput pad over as "Xbox 360 Controller", even a brand new Series pad, so the
 * model in the string says nothing about the pad on the desk. Anything that is plainly an Xbox pad
 * is shown as "Xbox controller", unless the name carries a model worth keeping, like Elite.
 */
function tidyXbox(name: string): string {
  if (!/xbox/i.test(name)) return name;
  const model = /\b(elite|adaptive)\b/i.exec(name)?.[1];
  if (model) return `Xbox ${model[0].toUpperCase()}${model.slice(1).toLowerCase()} controller`;
  return 'Xbox controller';
}

export function padName(id: string): string {
  const vendor = /vendor:?\s*([0-9a-f]{4})/i.exec(id)?.[1]?.toLowerCase();
  let name = id
    .replace(/\((?:[^()]*(?:vendor|product|standard gamepad|xinput)[^()]*)\)/gi, ' ')
    .replace(/\b(?:xinput|dinput|standard gamepad|extended gamepad|html5 gamepad)\b/gi, ' ')
    .replace(/^[0-9a-f]{4}[-_][0-9a-f]{4}[-_\s]*/i, '')
    .replace(/[\s_]+/g, ' ')
    .trim();
  // What is left is sometimes still only ids, or nothing at all.
  if (name.length < 3 || !/[a-z]{3}/i.test(name) || /^unknown/i.test(name)) name = '';
  if (!name && vendor && MAKERS[vendor]) name = MAKERS[vendor];
  if (!name) return 'Compatible controller';
  name = tidyXbox(name);
  // "Controller" twice over reads badly, and so does a name that never says what it is.
  return /\b(controller|gamepad|pad|joystick|wheel|stick)\b/i.test(name) ? name : `${name} controller`;
}

export interface PadInfo {
  connected: boolean;
  /** The first controller's name, for a one-line summary. */
  name: string;
  /** Every controller plugged in, in player order. */
  pads: { index: number; name: string; battery?: number }[];
}

/**
 * Words that say nothing about which controller this is. The browser's name for a pad and Windows'
 * name for the same pad rarely agree, but what they share is the interesting part: "Xbox Wireless
 * Controller" against "Xbox 360 Controller (XInput STANDARD GAMEPAD)" agree on "xbox" and nothing
 * else, and that is enough to pair a charge with a controller.
 */
const VAGUE = /^(controller|gamepad|game|pad|wireless|bluetooth|xinput|standard|compatible|vendor|product|for|the|and|usb|hid|device|input|v\d+|\d+)$/i;

function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !VAGUE.test(w))
  );
}

function sameController(a: string, b: string): boolean {
  const ta = tokens(a);
  for (const w of tokens(b)) if (ta.has(w)) return true;
  return false;
}

/**
 * Puts each charge Windows reported against the controller it belongs to. Windows names a pad
 * differently from the browser, so a name match is tried first; failing that, one controller with
 * no charge and one charge with no controller can only be each other.
 */
export function withBatteries(
  pads: { index: number; name: string }[],
  batteries: { name: string; percent: number }[]
): { index: number; name: string; battery?: number }[] {
  const spare = [...batteries];
  const out: { index: number; name: string; battery?: number }[] = pads.map((p) => {
    const i = spare.findIndex((b) => sameController(b.name, p.name));
    return i < 0 ? { ...p } : { ...p, battery: spare.splice(i, 1)[0].percent };
  });
  const bare = out.filter((p) => p.battery === undefined);
  if (bare.length === 1 && spare.length === 1) bare[0].battery = spare[0].percent;
  return out;
}

/** The controllers plugged in right now, with what charge Windows knows about, for showing them. */
export function usePadInfo(): PadInfo {
  const [info, setInfo] = useState<PadInfo>({ connected: false, name: '', pads: [] });
  const charge = useRef<{ name: string; percent: number }[]>([]);
  useEffect(() => {
    const read = () => {
      // Players are numbered from the order Windows hands the pads over, not from the array slot,
      // which leaves holes when a pad is unplugged.
      const live = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p?.connected);
      const pads = withBatteries(live.map((p, i) => ({ index: i + 1, name: padName(p.id) })), charge.current);
      const next: PadInfo = { connected: pads.length > 0, name: pads[0]?.name ?? '', pads };
      setInfo((was) => (
        was.pads.length === pads.length && was.pads.every((p, i) => p.name === pads[i].name && p.battery === pads[i].battery)
          ? was
          : next
      ));
    };
    read();
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    // Some pads only appear after their first button press, and a battery can die mid-game,
    // so a slow poll keeps the name honest without costing anything.
    const t = window.setInterval(read, 2000);
    // The charge comes from Windows, which means a PowerShell, so it is asked for far less often
    // than the names are. It barely moves in two minutes.
    const askCharge = (refresh = false) => {
      if (typeof document !== 'undefined' && document.hidden) return;
      api.padBattery?.(refresh).then((list) => {
        charge.current = list;
        read();
      }).catch(() => {});
    };
    askCharge();
    // Not forced: the main process keeps the answer for a minute, so two views open at once share
    // one PowerShell instead of starting two.
    const slow = window.setInterval(() => askCharge(), 120000);
    const onPad = () => askCharge(true);
    window.addEventListener('gamepadconnected', onPad);
    return () => {
      window.removeEventListener('gamepadconnected', read);
      window.removeEventListener('gamepaddisconnected', read);
      window.removeEventListener('gamepadconnected', onPad);
      window.clearInterval(t);
      window.clearInterval(slow);
    };
  }, []);
  return info;
}
