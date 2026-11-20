import type { LogoStyle } from '../../shared/types';

const P: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  shelves: 'M3 5h18v5H3zM3 14h18v5H3z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.5A2.5 2.5 0 0 0 8 9.5M16 6h2.5A2.5 2.5 0 0 1 16 9.5M12 13v3M9 19h6M10 19v-2.2a2 2 0 0 1 4 0V19',
  sparkle: 'M12 3l1.8 4.9L18.7 10l-4.9 1.8L12 16.7l-1.8-4.9L5.3 10l4.9-2.1zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  medal: 'M12 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM9 3l3 6M15 3l-3 6M7 3h10',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  eyeOff: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.4 3.4M6.1 6.1C4 7.6 3 10 3 12c0 2 4 7 9 7a9.7 9.7 0 0 0 4.5-1.1',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M3 21v-5h5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  tv: 'M3 6h18v11H3zM8 21h8M12 17v4',
  joystick: 'M12 3a4 4 0 0 0-1 7.9V15h2v-4.1A4 4 0 0 0 12 3zM6.5 15h11a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z',
  disk: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM6.5 15.5h.01M9.5 15.5h4M4 11h16',
  usb: 'M11 3h2v8h-2zM9 11h6v9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM12 3l-1.4 2h2.8z',
  play: 'M7 4l13 8-13 8z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  chevron: 'M9 6l6 6-6 6',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 14-4-1z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  sidebar: 'M4 4h16v16H4zM9 4v16',
  gamepad: 'M7 4h10a5 5 0 0 1 5 5v5a4 4 0 0 1-7 2.6L13.5 15h-3L9 16.6A4 4 0 0 1 2 14V9a5 5 0 0 1 5-5zM7.6 7.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M7.7 13.3h2.2M8.8 12.2v2.2M16.2 8.1h.01M18.3 10.2h.01M16.2 12.3h.01M14.1 10.2h.01',
  power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3.5 3H16a2 2 0 0 0-1.5 3.3A1.5 1.5 0 0 1 12 21zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11.5h.01',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  monitor: 'M3 5h18v12H3zM8 21h8M12 17v4',
  chevronLeft: 'M15 6l-6 6 6 6',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  cpu: 'M8 8h8v8H8zM4 10h4M4 14h4M16 10h4M16 14h4M10 4v4M14 4v4M10 16v4M14 16v4',
  thermo: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  cloud: 'M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5z',
  rain: 'M7 15a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 6.5a4.25 4.25 0 0 1-.5 8.5zM8 18l-1 3M12 18l-1 3M16 18l-1 3',
  snow: 'M7 14a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 5.5a4.25 4.25 0 0 1-.5 8.5zM8 18h.01M12 18h.01M16 18h.01M10 21h.01M14 21h.01',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  size: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z'
};

export function Icon({ name, size = 18, fill = false, className }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <svg className={`ic ic-${name} ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? ''} pathLength={1} />
    </svg>
  );
}

/**
 * The Lumen mark, in the style the user picked.
 *
 * Every style is drawn rather than filled, because the animation is a line being drawn: it arrives
 * thin, travels, and only thickens to its real weight once the shape is complete. The weight lives
 * on the <svg> so every path inherits it and one animation thickens the whole mark at once.
 *
 * Styles with a core show a light in the middle: green while Lumen is on, red as it goes off. That
 * is the whole point of the core, so it is the one part that is not the accent colour.
 */
export function Logo({ size = 26, animate, out, style }: { size?: number; animate?: boolean; out?: boolean; style?: LogoStyle }) {
  const kind: LogoStyle = style ?? 'power';
  return (
    <svg
      className={`logo-mark logo-${kind} ${animate ? 'draw' : ''} ${out ? 'undraw' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={6.5}
      strokeLinecap="round"
      aria-hidden
    >
      {kind === 'power' && <>
        {/* 250 degrees of circle, centred at 32,35, leaving the gap the stem passes through */}
        <path className="logo-ring" d="M15.6 23.5A20 20 0 1 0 48.4 23.5" pathLength={100} strokeDasharray="100 100" />
        <path className="logo-stem" d="M32 8V30" pathLength={100} strokeDasharray="100 100" />
      </>}

      {kind === 'orbit' && <>
        {/* What the name says: one tilted orbit with a moon on it, around the light. The ellipse
            and the moon share a group so the moon stays on its path when the group turns; the
            core does not turn, because the thing being orbited should sit still. */}
        <g className="logo-orbit-g">
          <ellipse className="logo-ring" cx="32" cy="32" rx="23" ry="13" strokeWidth={4.5}
                   transform="rotate(-28 32 32)" pathLength={100} strokeDasharray="100 100" />
          <circle className="logo-moon" cx="52.3" cy="21.2" r="5.5" fill="var(--accent)" stroke="none" />
        </g>
        <circle className="logo-core" cx="32" cy="32" r="5.5" fill="var(--logo-core)" stroke="none" />
      </>}

      {kind === 'pulse' && <>
        {/* The plainest of them: a closed ring and the light inside it. */}
        <circle className="logo-ring" cx="32" cy="32" r="21" pathLength={100} strokeDasharray="100 100" />
        <circle className="logo-core" cx="32" cy="32" r="6.5" fill="var(--logo-core)" stroke="none" />
      </>}

      {kind === 'reactor' && <>
        {/* Three arcs of the same circle with gaps between them, around the light. */}
        <path className="logo-ring" d="M46.8 17.2A21 21 0 0 1 46.8 46.8" pathLength={100} strokeDasharray="100 100" />
        <path className="logo-ring-b" d="M38.4 52.6A21 21 0 0 1 17.2 46.8" pathLength={100} strokeDasharray="100 100" />
        <path className="logo-ring-c" d="M11 32A21 21 0 0 1 32 11" pathLength={100} strokeDasharray="100 100" />
        <circle className="logo-core" cx="32" cy="32" r="7" fill="var(--logo-core)" stroke="none" />
      </>}

      {kind === 'spark' && <>
        {/* The first mark Lumen had, with its light brought into the middle: the ring still breaks
            open where the spark used to sit, so the gap is what is left of it. */}
        <circle className="logo-ring" cx="32" cy="32" r="20.5" strokeWidth={7} transform="rotate(-18 32 32)"
                pathLength={100} strokeDasharray="80 100" />
        <circle className="logo-core" cx="32" cy="32" r="7.5" fill="var(--logo-core)" stroke="none" />
      </>}
    </svg>
  );
}
