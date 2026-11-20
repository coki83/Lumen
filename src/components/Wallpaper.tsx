// Animated wallpapers, drawn on a canvas. All original scenes, tinted by the theme's accent.
import { isAppActive } from '../lib/focus';
import { useEffect, useRef } from 'react';
import { useWeather, weatherScene } from '../lib/weather';
import type { WallpaperId } from '../../shared/types';

export const WALLPAPERS: { id: WallpaperId; name: string; hint: string }[] = [
  { id: 'weather', name: 'Weather', hint: 'Follows the weather outside: rain, snow, clear sky, night' },
  { id: 'waves', name: 'Ribbons', hint: 'Slow flowing light ribbons' },
  { id: 'orbs', name: 'Orbs', hint: 'Soft glowing spheres drifting by' },
  { id: 'tiles', name: 'Tiles', hint: 'A calm grid of rounded tiles that breathe' },
  { id: 'aurora', name: 'Aurora', hint: 'Shifting curtains of color' },
  { id: 'stars', name: 'Starfield', hint: 'Particles gliding through space' },
  { id: 'grid', name: 'Horizon', hint: 'A glowing grid rolling toward the horizon' },
  { id: 'mesh', name: 'Constellation', hint: 'Drifting points joined by thin lines' },
  { id: 'bubbles', name: 'Bubbles', hint: 'Bubbles rising slowly' },
  { id: 'rain', name: 'Rain', hint: 'Soft rain at night' },
  { id: 'snow', name: 'Snow', hint: 'Slow falling snow' },
  { id: 'fireflies', name: 'Fireflies', hint: 'Little lights wandering in the dark' },
  { id: 'ripples', name: 'Ripples', hint: 'Rings spreading on still water' },
  { id: 'hills', name: 'Dusk hills', hint: 'Layered hills under a slow glowing sun' }
];

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ff8a3d';
}
function rgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Draw = (c: CanvasRenderingContext2D, w: number, h: number, t: number, accent: [number, number, number], bg: string) => void;

const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const SCENES: Record<Exclude<WallpaperId, 'weather'>, () => Draw> = {
  waves: () => (c, w, h, t, [r, g, b], bg) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    const grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
      c.beginPath();
      const amp = h * (0.06 + k * 0.006);
      const yb = h * 0.45 + Math.sin(t * 0.00015 + k) * h * 0.03;
      for (let x = -10; x <= w + 10; x += 12) {
        const y = yb + Math.sin(x * 0.0022 + t * 0.0003 + k * 0.35) * amp + Math.sin(x * 0.0051 - t * 0.0002 + k) * amp * 0.35;
        x === -10 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.strokeStyle = `rgba(${r},${g},${b},${0.1 + (k % 4) * 0.04})`;
      c.lineWidth = 1.5 + (k % 3) * 1.5;
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  },
  orbs: () => {
    const R = rand(7);
    const orbs = Array.from({ length: 18 }, () => ({ x: R(), y: R(), s: 0.05 + R() * 0.18, v: 0.2 + R() * 0.6, p: R() * 6, hue: R() }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      for (const o of orbs) {
        const x = ((o.x + t * 0.000008 * o.v) % 1.2 - 0.1) * w;
        const y = (o.y + Math.sin(t * 0.0002 * o.v + o.p) * 0.05) * h;
        const rad = o.s * Math.min(w, h);
        const gr = c.createRadialGradient(x, y, 0, x, y, rad);
        const mix = o.hue > 0.6 ? [255, 255, 255] : [r, g, b];
        gr.addColorStop(0, `rgba(${mix[0]},${mix[1]},${mix[2]},0.20)`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.beginPath();
        c.arc(x, y, rad, 0, Math.PI * 2);
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    };
  },
  tiles: () => (c, w, h, t, [r, g, b], bg) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    const size = Math.max(60, Math.min(w, h) / 9);
    const gap = size * 0.18;
    for (let y = -size; y < h + size; y += size + gap) {
      for (let x = -size; x < w + size; x += size + gap) {
        const wave = Math.sin(x * 0.004 + y * 0.003 - t * 0.0008) * 0.5 + 0.5;
        const a = 0.03 + wave * 0.09;
        const s = size * (0.86 + wave * 0.1);
        const ox = x + (size - s) / 2, oy = y + (size - s) / 2 + Math.sin(t * 0.0003 + x) * 2;
        c.fillStyle = `rgba(${r},${g},${b},${a})`;
        c.beginPath();
        c.roundRect(ox, oy, s, s, s * 0.22);
        c.fill();
      }
    }
  },
  aurora: () => (c, w, h, t, [r, g, b], bg) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    const cols = [[r, g, b], [Math.min(255, b + 60), r, g], [g, Math.min(255, b + 40), r]];
    for (let k = 0; k < 3; k++) {
      const [cr, cg, cb] = cols[k];
      for (let x = 0; x < w; x += 6) {
        const n = Math.sin(x * 0.003 + t * 0.0002 * (k + 1) + k * 2) + Math.sin(x * 0.0071 - t * 0.00013 + k);
        const top = h * (0.18 + k * 0.1) + n * h * 0.06;
        const len = h * (0.25 + 0.1 * Math.sin(x * 0.002 + t * 0.0001 + k));
        const gr = c.createLinearGradient(0, top, 0, top + len);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.045)`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.fillRect(x, top, 6, len);
      }
    }
    c.globalCompositeOperation = 'source-over';
  },
  stars: () => {
    const R = rand(11);
    const stars = Array.from({ length: 260 }, () => ({ x: R() * 2 - 1, y: R() * 2 - 1, z: R() }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const s of stars) {
        const z = (s.z + t * 0.00003) % 1;
        const depth = 1 - z;
        const x = cx + (s.x / (depth + 0.2)) * cx * 0.6;
        const y = cy + (s.y / (depth + 0.2)) * cy * 0.6;
        const size = z * 2.4;
        const a = Math.min(1, z * 1.5) * 0.8;
        c.fillStyle = z > 0.7 ? `rgba(${r},${g},${b},${a})` : `rgba(255,255,255,${a * 0.7})`;
        c.beginPath();
        c.arc(x, y, size, 0, Math.PI * 2);
        c.fill();
      }
    };
  }
  ,
  grid: () => (c, w, h, t, [r, g, b], bg) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    const hz = h * 0.52;
    const sky = c.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, 'rgba(0,0,0,0)');
    sky.addColorStop(1, `rgba(${r},${g},${b},0.22)`);
    c.fillStyle = sky;
    c.fillRect(0, 0, w, hz);
    const sun = c.createRadialGradient(w / 2, hz, 0, w / 2, hz, h * 0.35);
    sun.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
    c.lineWidth = 1.2;
    // lines running away from the viewer
    for (let i = -14; i <= 14; i++) {
      c.strokeStyle = `rgba(${r},${g},${b},0.22)`;
      c.beginPath();
      c.moveTo(w / 2 + i * w * 0.012, hz);
      c.lineTo(w / 2 + i * w * 0.16, h);
      c.stroke();
    }
    // lines rolling toward the viewer
    const phase = (t * 0.00012) % 1;
    for (let k = 0; k < 16; k++) {
      const z = (k + phase) / 16;
      const y = hz + Math.pow(z, 2.4) * (h - hz);
      c.strokeStyle = `rgba(${r},${g},${b},${0.06 + z * 0.3})`;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  },
  mesh: () => {
    const R = rand(23);
    const pts = Array.from({ length: 70 }, () => ({ x: R(), y: R(), vx: (R() - 0.5) * 0.00002, vy: (R() - 0.5) * 0.00002 }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const pos = pts.map((p) => {
        const wrap = (v: number) => ((v % 1) + 1) % 1;
        return [wrap(p.x + p.vx * t) * w, wrap(p.y + p.vy * t) * h];
      });
      const max = Math.min(w, h) * 0.17;
      c.lineWidth = 1;
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const d = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]);
          if (d > max) continue;
          c.strokeStyle = `rgba(${r},${g},${b},${(1 - d / max) * 0.28})`;
          c.beginPath();
          c.moveTo(pos[i][0], pos[i][1]);
          c.lineTo(pos[j][0], pos[j][1]);
          c.stroke();
        }
      }
      c.fillStyle = `rgba(${r},${g},${b},0.75)`;
      for (const [x, y] of pos) { c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
    };
  },
  bubbles: () => {
    const R = rand(31);
    const bs = Array.from({ length: 46 }, () => ({ x: R(), p: R(), s: 0.008 + R() * 0.035, v: 0.4 + R() * 0.8, sway: R() * 6 }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const glow = c.createLinearGradient(0, h, 0, h * 0.3);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      for (const o of bs) {
        const prog = (o.p + t * 0.00003 * o.v) % 1;
        const rad = o.s * Math.min(w, h);
        const y = h + rad - prog * (h + rad * 2);
        const x = o.x * w + Math.sin(t * 0.0006 * o.v + o.sway) * rad * 1.2;
        c.strokeStyle = `rgba(${r},${g},${b},0.5)`;
        c.fillStyle = `rgba(${r},${g},${b},0.07)`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, rad, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.14, 0, Math.PI * 2);
        c.fill();
      }
    };
  },
  rain: () => {
    const R = rand(41);
    const drops = Array.from({ length: 220 }, () => ({ x: R() * 1.3, p: R(), v: 0.6 + R() * 0.9, l: 0.02 + R() * 0.05, a: 0.08 + R() * 0.25 }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const haze = c.createRadialGradient(w * 0.7, h * 0.1, 0, w * 0.7, h * 0.1, h);
      haze.addColorStop(0, `rgba(${r},${g},${b},0.16)`);
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = haze;
      c.fillRect(0, 0, w, h);
      c.lineWidth = 1.2;
      c.lineCap = 'round';
      for (const d of drops) {
        const prog = (d.p + t * 0.00045 * d.v) % 1;
        const y = prog * h * 1.2 - h * 0.1;
        const x = d.x * w - prog * h * 0.22;
        const len = d.l * h;
        c.strokeStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)},${d.a})`;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - len * 0.18, y + len);
        c.stroke();
      }
    };
  },
  snow: () => {
    const R = rand(53);
    const flakes = Array.from({ length: 170 }, () => ({ x: R(), p: R(), v: 0.3 + R() * 0.7, s: 0.8 + R() * 3, sway: R() * 6 }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const glow = c.createLinearGradient(0, 0, 0, h);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.14)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      for (const f of flakes) {
        const prog = (f.p + t * 0.00004 * f.v) % 1;
        const y = prog * (h + 20) - 10;
        const x = f.x * w + Math.sin(t * 0.0005 * f.v + f.sway) * 26;
        c.fillStyle = `rgba(255,255,255,${0.15 + (f.s / 3.8) * 0.5})`;
        c.beginPath();
        c.arc(x, y, f.s, 0, Math.PI * 2);
        c.fill();
      }
    };
  },
  fireflies: () => {
    const R = rand(67);
    const fs = Array.from({ length: 42 }, () => ({ x: R(), y: R(), a: R() * 6, b: R() * 6, v: 0.4 + R() * 0.8, s: 2 + R() * 3 }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      for (const f of fs) {
        const x = (f.x + Math.sin(t * 0.00012 * f.v + f.a) * 0.08 + Math.sin(t * 0.00031 * f.v + f.b) * 0.03) * w;
        const y = (f.y + Math.cos(t * 0.0001 * f.v + f.b) * 0.08 + Math.sin(t * 0.00027 * f.v + f.a) * 0.03) * h;
        const blink = Math.max(0, Math.sin(t * 0.0012 * f.v + f.a * 3)) ** 2;
        const rad = f.s * 7;
        const gr = c.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${r},${g},${b},${0.15 + blink * 0.6})`);
        gr.addColorStop(0.25, `rgba(${r},${g},${b},${0.05 + blink * 0.2})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.beginPath();
        c.arc(x, y, rad, 0, Math.PI * 2);
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    };
  },
  ripples: () => {
    const R = rand(79);
    const src = Array.from({ length: 7 }, () => ({ x: R(), y: R(), p: R(), v: 0.5 + R() * 0.6 }));
    return (c, w, h, t, [r, g, b], bg) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const max = Math.max(w, h) * 0.45;
      for (const s of src) {
        for (let k = 0; k < 4; k++) {
          const prog = (s.p + t * 0.00004 * s.v + k / 4) % 1;
          c.strokeStyle = `rgba(${r},${g},${b},${(1 - prog) * 0.3})`;
          c.lineWidth = 1 + (1 - prog) * 2;
          c.beginPath();
          c.ellipse(s.x * w, s.y * h, prog * max, prog * max * 0.55, 0, 0, Math.PI * 2);
          c.stroke();
        }
      }
    };
  },
  hills: () => (c, w, h, t, [r, g, b], bg) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    const sx = w * (0.5 + Math.sin(t * 0.00003) * 0.25), sy = h * (0.42 + Math.cos(t * 0.00003) * 0.06);
    const sun = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.6);
    sun.addColorStop(0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 40)},${b},0.55)`);
    sun.addColorStop(0.12, `rgba(${r},${g},${b},0.32)`);
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 5; k++) {
      const base = h * (0.5 + k * 0.1);
      const drift = t * 0.000012 * (k + 1);
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w + 16; x += 16) {
        const y = base + Math.sin(x * 0.0018 * (1 + k * 0.25) + drift * 6 + k * 1.7) * h * 0.05 + Math.sin(x * 0.0047 + drift * 9 + k) * h * 0.018;
        c.lineTo(x, y);
      }
      c.lineTo(w, h);
      c.closePath();
      const shade = 0.5 - k * 0.09;
      c.fillStyle = `rgba(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)},${0.55 + k * 0.1})`;
      c.fill();
      c.fillStyle = `rgba(0,0,0,${0.15 + k * 0.1})`;
      c.fill();
    }
  }
};

export function Wallpaper({ kind: asked, video, still }: { kind: WallpaperId | 'video'; video?: string; still?: boolean }) {
  // The Weather wallpaper is whichever scene matches the sky outside right now.
  const w = useWeather(asked === 'weather');
  const kind = asked === 'weather' ? weatherScene(w) : asked;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (kind === 'video') return;
    const cv = ref.current!;
    const c = cv.getContext('2d')!;
    const draw = SCENES[kind]();
    let raf = 0;
    let last = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
    };
    fit();
    window.addEventListener('resize', fit);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!isAppActive() || t - last < 33) return; // ~30 fps is plenty, and nothing at all behind a game
      last = t;
      draw(c, cv.width, cv.height, t, rgb(cssVar('--accent')), cssVar('--bg'));
    };
    if (still) draw(c, cv.width, cv.height, 12000, rgb(cssVar('--accent')), cssVar('--bg'));
    else raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [kind, still]);
  if (kind === 'video') return video ? <video className="wallpaper" src={video} autoPlay muted loop playsInline /> : null;
  return <canvas ref={ref} className="wallpaper" />;
}
