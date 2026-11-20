// Default input bindings, shared by the app and settings. Keys use KeyboardEvent.key names.
export const PAD_ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb', 'start', 'select'] as const;
export type PadActionId = (typeof PAD_ACTIONS)[number];

export const PAD_ACTION_LABELS: Record<PadActionId, string> = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', a: 'Select / details', b: 'Back',
  x: 'Play now', y: 'Favorite', lb: 'Previous tab', rb: 'Next tab', start: 'Menu', select: 'Power menu'
};

export const DEFAULT_KEYS: Record<PadActionId, string[]> = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter', ' '], b: ['Escape', 'Backspace'],
  x: ['p'], y: ['f'], lb: ['q'], rb: ['e', 'Tab'], start: ['m'], select: ['o']
};

// Standard Gamepad mapping indexes (Xbox layout names).
export const DEFAULT_PAD: Record<PadActionId, number[]> = {
  up: [12], down: [13], left: [14], right: [15], a: [0], b: [1], x: [2], y: [3], lb: [4], rb: [5], start: [9], select: [8]
};

export const PAD_BUTTON_NAMES: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'L-stick', 11: 'R-stick',
  12: 'D-pad up', 13: 'D-pad down', 14: 'D-pad left', 15: 'D-pad right', 16: 'Guide'
};

/** App shortcuts (desktop and Big Screen). Format: Ctrl+Shift+Alt+Key, same as Electron accelerators. */
export const APP_SHORTCUTS = {
  bigScreen: { label: 'Open or close Big Screen', def: 'Ctrl+B' },
  search: { label: 'Search your games', def: 'Ctrl+F' },
  rescan: { label: 'Scan launchers', def: 'F5' },
  settings: { label: 'Open settings', def: 'Ctrl+,' },
  power: { label: 'Power menu', def: 'Ctrl+Shift+P' },
  addGame: { label: 'Add a game', def: 'Ctrl+N' },
  toggleMusic: { label: 'Music on or off', def: 'Ctrl+Shift+M' }
} as const;
export type AppShortcutId = keyof typeof APP_SHORTCUTS;
export const DEFAULT_SHORTCUTS = Object.fromEntries(Object.entries(APP_SHORTCUTS).map(([k, v]) => [k, v.def])) as Record<AppShortcutId, string>;

export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return parts.join('+');
  parts.push(k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
  return parts.join('+');
}

export function keyLabel(k: string): string {
  const map: Record<string, string> = { ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Backspace: '⌫' };
  return map[k] ?? (k.length === 1 ? k.toUpperCase() : k);
}
