// Screensaver: after a few quiet minutes Lumen turns the TV into a window on space.
// Every scene is drawn here with plain canvas work, all original, and everything moves slowly
// and stays dark so a TV panel is happy with it. The clock drifts around for the same reason.
import { useEffect, useMemo, useRef, useState } from 'react';
import { isAppActive } from '../lib/focus';
import { useWeather } from '../lib/weather';
import { usePulse } from '../lib/pulse';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import type { PulseItem } from '../../shared/types';

export type SaverId = 'warp' | 'nebula' | 'planet' | 'comets' | 'galaxy' | 'rings' | 'orbit';

export const SAVERS: { id: SaverId; name: string; hint: string }[] = [
  { id: 'warp', name: 'Warp', hint: 'Stars streaming past, slowly' },
  { id: 'nebula', name: 'Nebula', hint: 'Clouds of colour drifting through a star field' },
  { id: 'planet', name: 'Planet rise', hint: 'A world turning under its own atmosphere' },
  { id: 'comets', name: 'Comets', hint: 'Long quiet trails crossing the dark' },
  { id: 'galaxy', name: 'Galaxy', hint: 'A spiral turning around its core' },
  { id: 'rings', name: 'Ringed world', hint: 'A ringed planet with a small moon' },
  { id: 'orbit', name: 'Low orbit', hint: 'City lights and aurora on the edge of a world' }
];

const HOLD = 14000; // how long one panel stays before it fades
const FADE = 1200; // long enough to read as a fade, short enough not to feel broken

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const accentRgb = (): [number, number, number] => {
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff8a3d';
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

type Scene = (c: CanvasRenderingContext2D, w: number, h: number, t: number, a: [number, number, number]) => void;

function stars(n: number, seed = 7) {
  const r = rnd(seed);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), z: r(), tw: r() * 6.283 }));
}

function drawStars(c: CanvasRenderingContext2D, w: number, h: number, t: number, list: ReturnType<typeof stars>, drift = 0.004) {
  for (const s of list) {
    const x = ((s.x + t * drift * (0.3 + s.z)) % 1) * w;
    const y = s.y * h;
    const a = 0.25 + 0.6 * s.z * (0.7 + 0.3 * Math.sin(t * 0.6 + s.tw));
    c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    c.fillRect(x, y, s.z > 0.8 ? 2 : 1, s.z > 0.8 ? 2 : 1);
  }
}

/** Soft coloured cloud, built from a few overlapping radial gradients. */
function cloud(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col.replace('ALPHA', String(alpha)));
  g.addColorStop(0.5, col.replace('ALPHA', String(alpha * 0.45)));
  g.addColorStop(1, col.replace('ALPHA', '0'));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, 6.283);
  c.fill();
}

const SCENES: Record<SaverId, () => Scene> = {
  warp: () => {
    const r = rnd(911);
    const pts = Array.from({ length: 420 }, () => ({ a: r() * 6.283, d: r(), s: 0.25 + r() * 0.8, hue: r() }));
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#04050a';
      c.fillRect(0, 0, w, h);
      const cx = w / 2 + Math.sin(t * 0.07) * w * 0.06;
      const cy = h / 2 + Math.cos(t * 0.05) * h * 0.05;
      const max = Math.hypot(w, h) / 2;
      for (const p of pts) {
        const d = ((p.d + t * 0.013 * p.s) % 1) ** 2.2;
        const r1 = d * max;
        const r2 = Math.max(0, d * (1 - (0.06 + 0.1 * p.s))) * max;
        const x1 = cx + Math.cos(p.a) * r1, y1 = cy + Math.sin(p.a) * r1;
        const x2 = cx + Math.cos(p.a) * r2, y2 = cy + Math.sin(p.a) * r2;
        const a = Math.min(0.9, 0.12 + d * 0.95);
        c.strokeStyle = p.hue > 0.82 ? `rgba(${ar},${ag},${ab},${a.toFixed(3)})` : `rgba(214,228,255,${a.toFixed(3)})`;
        c.lineWidth = 0.6 + d * 2;
        c.beginPath();
        c.moveTo(x2, y2);
        c.lineTo(x1, y1);
        c.stroke();
      }
    };
  },
  nebula: () => {
    const sky = stars(220, 3);
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#05040c';
      c.fillRect(0, 0, w, h);
      drawStars(c, w, h, t, sky, 0.002);
      const puffs = [
        { x: 0.3, y: 0.42, r: 0.5, col: `rgba(${ar},${ag},${ab},ALPHA)`, a: 0.13, sp: 0.021 },
        { x: 0.68, y: 0.55, r: 0.46, col: 'rgba(90,130,255,ALPHA)', a: 0.15, sp: -0.016 },
        { x: 0.5, y: 0.3, r: 0.36, col: 'rgba(190,90,220,ALPHA)', a: 0.1, sp: 0.027 },
        { x: 0.2, y: 0.72, r: 0.3, col: 'rgba(60,200,210,ALPHA)', a: 0.09, sp: -0.023 }
      ];
      c.globalCompositeOperation = 'screen';
      puffs.forEach((p, i) => {
        const x = (p.x + Math.sin(t * p.sp + i) * 0.05) * w;
        const y = (p.y + Math.cos(t * p.sp * 0.8 + i) * 0.04) * h;
        cloud(c, x, y, p.r * Math.min(w, h) * (1 + 0.06 * Math.sin(t * 0.08 + i)), p.col, p.a);
      });
      c.globalCompositeOperation = 'source-over';
    };
  },
  planet: () => {
    const sky = stars(190, 21);
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#03040a';
      c.fillRect(0, 0, w, h);
      drawStars(c, w, h, t, sky, 0.0012);
      const r = Math.min(w, h) * 0.78;
      const cx = w * 0.5, cy = h + r * 0.62 + Math.sin(t * 0.04) * h * 0.02;
      // atmosphere
      const air = c.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.14);
      air.addColorStop(0, `rgba(${ar},${ag},${ab},0.22)`);
      air.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = air;
      c.beginPath();
      c.arc(cx, cy, r * 1.14, 0, 6.283);
      c.fill();
      // the world itself, lit from the left
      const body = c.createLinearGradient(cx - r, cy - r, cx + r * 0.6, cy + r * 0.4);
      body.addColorStop(0, '#2a4f72');
      body.addColorStop(0.45, '#15304a');
      body.addColorStop(1, '#05080e');
      c.fillStyle = body;
      c.beginPath();
      c.arc(cx, cy, r, 0, 6.283);
      c.fill();
      // slow bands of cloud
      c.save();
      c.beginPath();
      c.arc(cx, cy, r, 0, 6.283);
      c.clip();
      for (let i = 0; i < 7; i++) {
        const y = cy - r + ((i * 0.16 + t * 0.004) % 1.1) * r * 1.2;
        c.fillStyle = `rgba(255,255,255,${0.02 + (i % 3) * 0.012})`;
        c.beginPath();
        c.ellipse(cx + Math.sin(t * 0.05 + i) * r * 0.1, y, r * 0.95, r * 0.035 + i * 0.004 * r, 0, 0, 6.283);
        c.fill();
      }
      c.restore();
    };
  },
  comets: () => {
    const sky = stars(240, 5);
    const r = rnd(4231);
    const shots = Array.from({ length: 5 }, () => ({ y: 0.1 + r() * 0.7, sp: 0.02 + r() * 0.03, off: r() * 10, tilt: (r() - 0.5) * 0.5, len: 0.16 + r() * 0.2 }));
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#04050b';
      c.fillRect(0, 0, w, h);
      drawStars(c, w, h, t, sky, 0.0015);
      for (const s of shots) {
        const p = ((t * s.sp + s.off) % 1.5) - 0.25;
        if (p < -0.2 || p > 1.2) continue;
        const x = p * w, y = (s.y + p * s.tilt) * h;
        const tx = x - s.len * w, ty = y - s.len * s.tilt * h;
        const g = c.createLinearGradient(tx, ty, x, y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, `rgba(${ar},${ag},${ab},0.5)`);
        c.strokeStyle = g;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(tx, ty);
        c.lineTo(x, y);
        c.stroke();
        const head = c.createRadialGradient(x, y, 0, x, y, 16);
        head.addColorStop(0, 'rgba(255,255,255,.85)');
        head.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = head;
        c.beginPath();
        c.arc(x, y, 16, 0, 6.283);
        c.fill();
      }
    };
  },
  galaxy: () => {
    const r = rnd(7717);
    const arms = Array.from({ length: 900 }, (_, i) => {
      const d = 0.08 + r() ** 0.7 * 0.92;
      return { d, a: (i % 3) * 2.094 + d * 3.6 + (r() - 0.5) * 0.5, s: r(), w: (r() - 0.5) * 0.12 };
    });
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#04030a';
      c.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, max = Math.min(w, h) * 0.46;
      const core = c.createRadialGradient(cx, cy, 0, cx, cy, max * 0.5);
      core.addColorStop(0, 'rgba(255,245,220,.5)');
      core.addColorStop(0.35, `rgba(${ar},${ag},${ab},.14)`);
      core.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = core;
      c.beginPath();
      c.arc(cx, cy, max * 0.5, 0, 6.283);
      c.fill();
      const spin = t * 0.035;
      for (const p of arms) {
        const a = p.a + spin * (1.3 - p.d);
        const x = cx + Math.cos(a) * p.d * max * (1 + p.w);
        const y = cy + Math.sin(a) * p.d * max * 0.42 * (1 + p.w);
        const al = (0.14 + p.s * 0.5) * (1 - p.d * 0.5);
        c.fillStyle = p.s > 0.9 ? `rgba(${ar},${ag},${ab},${al.toFixed(3)})` : `rgba(226,234,255,${al.toFixed(3)})`;
        c.fillRect(x, y, p.s > 0.93 ? 2 : 1, p.s > 0.93 ? 2 : 1);
      }
    };
  },
  rings: () => {
    const sky = stars(200, 43);
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#03040b';
      c.fillRect(0, 0, w, h);
      drawStars(c, w, h, t, sky, 0.0012);
      const cx = w * 0.52 + Math.sin(t * 0.03) * w * 0.02;
      const cy = h * 0.52;
      const r = Math.min(w, h) * 0.22;
      const tilt = 0.3 + Math.sin(t * 0.02) * 0.06;
      const ring = (f: number, alpha: number, width: number) => {
        c.save();
        c.translate(cx, cy);
        c.scale(1, tilt);
        c.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`;
        c.lineWidth = width;
        c.beginPath();
        c.arc(0, 0, r * f, 0, 6.283);
        c.stroke();
        c.restore();
      };
      ring(1.9, 0.1, r * 0.16);
      ring(2.25, 0.07, r * 0.1);
      ring(1.62, 0.13, r * 0.08);
      const body = c.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
      body.addColorStop(0, '#d9b98a');
      body.addColorStop(0.55, '#8a6a4c');
      body.addColorStop(1, '#241a16');
      c.fillStyle = body;
      c.beginPath();
      c.arc(cx, cy, r, 0, 6.283);
      c.fill();
      // front half of the rings passes over the planet
      c.save();
      c.beginPath();
      c.rect(0, cy, w, h - cy);
      c.clip();
      ring(1.9, 0.12, r * 0.16);
      ring(1.62, 0.15, r * 0.08);
      c.restore();
      // a small moon going round
      const ma = t * 0.12;
      const mx = cx + Math.cos(ma) * r * 3.1, my = cy + Math.sin(ma) * r * 3.1 * tilt;
      c.fillStyle = 'rgba(230,230,240,.85)';
      c.beginPath();
      c.arc(mx, my, Math.max(2, r * 0.07), 0, 6.283);
      c.fill();
    };
  },
  orbit: () => {
    const sky = stars(170, 61);
    const cr = rnd(5519);
    const cities = Array.from({ length: 150 }, () => ({ a: cr(), d: cr(), s: cr() }));
    return (c, w, h, t, [ar, ag, ab]) => {
      c.fillStyle = '#02030a';
      c.fillRect(0, 0, w, h);
      drawStars(c, w, h, t, sky, 0.001);
      const r = Math.max(w, h) * 1.25;
      const cx = w * 0.5, cy = h + r * 0.74;
      // the thin blue line of the atmosphere
      const air = c.createRadialGradient(cx, cy, r * 0.985, cx, cy, r * 1.06);
      air.addColorStop(0, 'rgba(90,160,255,.45)');
      air.addColorStop(0.4, `rgba(${ar},${ag},${ab},.12)`);
      air.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = air;
      c.beginPath();
      c.arc(cx, cy, r * 1.06, 0, 6.283);
      c.fill();
      c.fillStyle = '#05070f';
      c.beginPath();
      c.arc(cx, cy, r, 0, 6.283);
      c.fill();
      // lights of cities on the night side, drifting as the world turns
      c.save();
      c.beginPath();
      c.arc(cx, cy, r, 0, 6.283);
      c.clip();
      for (const p of cities) {
        const a = -Math.PI / 2 + ((p.a + t * 0.004) % 1 - 0.5) * 1.1;
        const d = r * (0.995 - p.d * 0.09);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        c.fillStyle = `rgba(255,206,140,${(0.35 + p.s * 0.55).toFixed(2)})`;
        c.fillRect(x, y, 2, 2);
      }
      c.restore();
      // aurora sits above the edge of the world, so it is drawn outside the clip
      for (let i = 0; i < 3; i++) {
        const o = t * 0.25 + i * 2;
        c.strokeStyle = `rgba(80,230,180,${0.05 + i * 0.02})`;
        c.lineWidth = 10 + i * 8;
        c.beginPath();
        for (let x = -0.1; x <= 1.1; x += 0.02) {
          const px = x * w;
          const base = cy - Math.sqrt(Math.max(0, r * r - (px - cx) * (px - cx)));
          const py = base - 14 - i * 10 - Math.sin(x * 7 + o) * 10;
          x === -0.1 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.stroke();
      }
    };
  }
};

/** One panel of the slow carousel the screensaver shows. */
interface Slide { id: string; kind: 'clock' | 'weather' | 'news' | 'list'; title?: string; label?: string; icon?: string; lines?: string[]; items?: PulseItem[] }

export function Screensaver({ scene, clock, info, weatherOn, onWake }: { scene: SaverId | 'shuffle'; clock: boolean; info?: boolean; weatherOn?: boolean; onWake(): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [which, setWhich] = useState<SaverId>(() => (scene === 'shuffle' ? SAVERS[Math.floor(Math.random() * SAVERS.length)].id : scene));

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(t);
  }, []);

  // Shuffle moves to another view now and then, so a long night is not one picture.
  useEffect(() => {
    if (scene !== 'shuffle') return setWhich(scene as SaverId);
    const t = window.setInterval(() => {
      setWhich((cur) => {
        const rest = SAVERS.filter((s) => s.id !== cur);
        return rest[Math.floor(Math.random() * rest.length)].id;
      });
      setPlace(Math.random());
    }, 90000);
    return () => window.clearInterval(t);
  }, [scene]);

  // What the panel can show: the clock, the weather, headlines about your games, the new releases
  // and the world chart. Each one fades in, holds, and fades out again before the next.
  const weather = useWeather(!!weatherOn && !!info);
  const news = usePulse(info ? 'news' : undefined);
  const world = usePulse(info ? 'world' : undefined);
  const fresh = usePulse(info ? 'releases' : undefined);
  const slides: Slide[] = useMemo(() => {
    const out: Slide[] = [];
    if (clock) out.push({ id: 'clock', kind: 'clock' });
    if (info && weather?.ok) {
      out.push({
        id: 'weather', kind: 'weather',
        title: `${weather.temp}°${weather.unit === 'f' ? 'F' : 'C'}`,
        lines: [`${weather.label} in ${weather.place}`]
      });
    }
    if (info) {
      for (const n of news.items.slice(0, 3)) out.push({ id: n.id, kind: 'news', label: t('Game news'), icon: 'info', title: n.title, lines: [n.meta, n.sub].filter(Boolean) as string[] });
      if (world.items.length) out.push({ id: 'world', kind: 'list', label: t('Most played in the world'), icon: 'trophy', items: world.items.slice(0, 5) });
      if (fresh.items.length) out.push({ id: 'fresh', kind: 'list', label: t('Just released on Steam'), icon: 'sparkle', items: fresh.items.slice(0, 5) });
    }
    return out;
  }, [clock, info, weather, news.items, world.items, fresh.items]);

  // The carousel: hold a slide for a while, fade it out, move to the next and a new spot, fade in.
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(true);
  const [place, setPlace] = useState(() => Math.random());
  useEffect(() => {
    if (slides.length < 2) { setShow(true); return; }
    const hold = window.setInterval(() => {
      setShow(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % slides.length);
        setPlace(Math.random());
        setShow(true);
      }, FADE);
    }, HOLD);
    return () => window.clearInterval(hold);
  }, [slides.length]);
  const slide = slides.length ? slides[Math.min(idx, slides.length - 1)] : undefined;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const c = cv.getContext('2d');
    if (!c) return;
    const draw = SCENES[which]();
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.floor(innerWidth * dpr);
      cv.height = Math.floor(innerHeight * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      if (!isAppActive() || ms - last < 33) return; // 30 fps is plenty, and nothing while a game is in front
      last = ms;
      draw(c, innerWidth, innerHeight, (ms - start) / 1000, accentRgb());
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [which]);

  return (
    <div className="saver" onMouseDown={onWake} onKeyDown={onWake} role="presentation">
      <canvas ref={ref} />
      {slide && (
        <div
          key={slide.id}
          className={`saver-panel ${slide.kind} ${show ? 'in' : 'out'}`}
          style={{ left: `${14 + place * 56}%`, top: `${22 + ((place * 7) % 1) * 46}%` }}
        >
          {slide.kind === 'clock' && (
            <>
              <b className="saver-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
              <span className="saver-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </>
          )}
          {slide.kind === 'weather' && (
            <>
              <b className="saver-time">{slide.title}</b>
              <span className="saver-date">{slide.lines?.[0]}</span>
            </>
          )}
          {(slide.kind === 'news' || slide.kind === 'list') && (
            <>
              <span className="saver-label">{slide.icon && <Icon name={slide.icon} size={16} />} {slide.label}</span>
              {slide.kind === 'news' ? (
                <>
                  <b className="saver-head">{slide.title}</b>
                  {slide.lines?.map((l, i) => <span key={i} className="saver-line">{l}</span>)}
                </>
              ) : (
                <ul className="saver-list">
                  {slide.items?.map((it) => (
                    <li key={it.id}><b>{it.title}</b>{it.meta && <em>{it.meta}</em>}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      <div className="saver-hint">{t('Press any button to come back')}</div>
    </div>
  );
}
