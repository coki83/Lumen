export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  vars: Record<string, string>;
  font: string;
}

const base = (v: Partial<Record<string, string>>) => v as Record<string, string>;

export const THEMES: Theme[] = [
  {
    id: 'noir', name: 'Noir', dark: true, font: 'inter',
    vars: base({ bg: '#08080a', bg2: '#101013', panel: 'rgba(20,20,25,0.62)', panel2: 'rgba(36,36,43,0.72)', text: '#f4f0e9', muted: '#948d82', accent: '#d9b26a', accentInk: '#14100a', border: 'rgba(244,240,233,0.09)', glow: 'rgba(217,178,106,0.34)' })
  },
  {
    id: 'ember', name: 'Ember', dark: true, font: 'inter',
    vars: base({ bg: '#0f0c0e', bg2: '#17121a', panel: 'rgba(32,24,30,0.72)', panel2: 'rgba(52,38,44,0.75)', text: '#f6ece6', muted: '#a8968f', accent: '#ff8a3d', accentInk: '#1b0e05', border: 'rgba(255,214,190,0.10)', glow: 'rgba(255,138,61,0.45)' })
  },
  {
    id: 'tide', name: 'Tide', dark: true, font: 'inter',
    vars: base({ bg: '#071219', bg2: '#0b1c26', panel: 'rgba(14,34,46,0.72)', panel2: 'rgba(22,50,66,0.78)', text: '#e6f4f8', muted: '#86a7b3', accent: '#3fd0c9', accentInk: '#031614', border: 'rgba(170,230,240,0.10)', glow: 'rgba(63,208,201,0.45)' })
  },
  {
    id: 'orchid', name: 'Orchid', dark: true, font: 'rounded',
    vars: base({ bg: '#110b18', bg2: '#1a1124', panel: 'rgba(36,22,48,0.72)', panel2: 'rgba(54,34,72,0.78)', text: '#f3e9ff', muted: '#a593b8', accent: '#c58bff', accentInk: '#16072a', border: 'rgba(220,190,255,0.10)', glow: 'rgba(197,139,255,0.45)' })
  },
  {
    id: 'moss', name: 'Moss', dark: true, font: 'serif',
    vars: base({ bg: '#0c110c', bg2: '#131b13', panel: 'rgba(26,36,24,0.74)', panel2: 'rgba(38,52,34,0.78)', text: '#eef2e4', muted: '#9aa68c', accent: '#b7d96a', accentInk: '#121a04', border: 'rgba(210,235,180,0.10)', glow: 'rgba(183,217,106,0.40)' })
  },
  {
    id: 'arcade', name: 'Arcade', dark: true, font: 'mono',
    vars: base({ bg: '#06060c', bg2: '#0c0c18', panel: 'rgba(16,16,34,0.78)', panel2: 'rgba(26,26,54,0.82)', text: '#f1f1ff', muted: '#8d8db8', accent: '#ff3d9a', accentInk: '#1a0010', border: 'rgba(120,200,255,0.16)', glow: 'rgba(255,61,154,0.55)' })
  },
  {
    id: 'graphite', name: 'Graphite', dark: true, font: 'inter',
    vars: base({ bg: '#111214', bg2: '#18191c', panel: 'rgba(30,31,35,0.80)', panel2: 'rgba(44,46,51,0.85)', text: '#ececee', muted: '#9a9ca3', accent: '#e8e8ea', accentInk: '#111214', border: 'rgba(255,255,255,0.09)', glow: 'rgba(255,255,255,0.25)' })
  },
  {
    id: 'paper', name: 'Paper', dark: false, font: 'serif',
    vars: base({ bg: '#f4efe6', bg2: '#ebe4d8', panel: 'rgba(255,252,246,0.82)', panel2: 'rgba(238,230,216,0.90)', text: '#2a2420', muted: '#7d7166', accent: '#c4511f', accentInk: '#fff8f2', border: 'rgba(60,40,20,0.12)', glow: 'rgba(196,81,31,0.30)' })
  },
  {
    id: 'frost', name: 'Frost', dark: false, font: 'rounded',
    vars: base({ bg: '#eef3f8', bg2: '#e2eaf2', panel: 'rgba(255,255,255,0.80)', panel2: 'rgba(226,236,246,0.92)', text: '#16212c', muted: '#64748a', accent: '#2f6bff', accentInk: '#ffffff', border: 'rgba(20,40,80,0.12)', glow: 'rgba(47,107,255,0.30)' })
  }
];

export const FONTS: Record<string, string> = {
  inter: "'Inter', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  rounded: "'Nunito', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  serif: "'Fraunces', 'Georgia', serif"
};

export const ACCENT_SWATCHES = ['#ff8a3d', '#ffd23d', '#b7d96a', '#3fd0c9', '#4da3ff', '#2f6bff', '#c58bff', '#ff3d9a', '#ff5c5c', '#e8e8ea'];

export function inkFor(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

export function hexToGlow(hex: string, a = 0.45): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
