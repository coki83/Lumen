// One shared weather reading for the whole app: header chips and the Weather wallpaper read the same value.
import { useEffect, useSyncExternalStore } from 'react';
import type { WallpaperId, WeatherInfo } from '../../shared/types';
import { api } from './api';

let current: WeatherInfo | null = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let users = 0;

export async function refreshWeather(force = false): Promise<WeatherInfo> {
  const w = await api.weather(force).catch((e) => ({ ok: false, error: String(e) }) as WeatherInfo);
  current = w;
  subs.forEach((f) => f());
  return w;
}

/** Current weather, refreshed every 15 minutes while `on`. Returns null until the first reading. */
export function useWeather(on: boolean, key = ''): WeatherInfo | null {
  const w = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
  useEffect(() => {
    if (!on) return;
    users++;
    refreshWeather();
    if (!timer) timer = setInterval(() => refreshWeather(), 15 * 60_000);
    return () => { if (--users === 0 && timer) { clearInterval(timer); timer = undefined; } };
  }, [on, key]);
  return on ? w : null;
}

/** Which live scene matches the weather outside. */
export function weatherScene(w: WeatherInfo | null): Exclude<WallpaperId, 'weather'> {
  if (!w?.ok) return 'hills';
  switch (w.kind) {
    case 'rain': case 'storm': return 'rain';
    case 'snow': return 'snow';
    case 'fog': return 'ripples';
    case 'cloudy': return w.isDay ? 'waves' : 'orbs';
    default: return w.isDay ? 'hills' : 'stars';
  }
}

export const weatherIcon = (w: WeatherInfo) => (w.kind === 'clear' ? (w.isDay ? 'sun' : 'moon') : w.kind === 'cloudy' || w.kind === 'fog' ? 'cloud' : w.kind === 'snow' ? 'snow' : w.kind === 'storm' ? 'bolt' : 'rain');
