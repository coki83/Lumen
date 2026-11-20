// Local weather from Open-Meteo (free, no key, no account). The place is either a city the user typed
// or, when left empty, a rough location looked up from the PC's internet address.
import { net } from 'electron';
import type { WeatherInfo, WeatherKind } from '../shared/types';

interface Place { lat: number; lon: number; name: string }
let cache: { key: string; at: number; info: WeatherInfo } | undefined;
const places = new Map<string, Place>();

async function json(url: string): Promise<any> {
  const r = await net.fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Weather service returned ${r.status}`);
  return r.json();
}

async function findPlace(city: string): Promise<Place> {
  const key = city.trim().toLowerCase();
  if (places.has(key)) return places.get(key)!;
  let p: Place;
  if (key) {
    const j = await json(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(city.trim())}`);
    const r = j?.results?.[0];
    if (!r) throw new Error(`Couldn't find a place called "${city.trim()}"`);
    p = { lat: r.latitude, lon: r.longitude, name: [r.name, r.country_code].filter(Boolean).join(', ') };
  } else {
    const j = await json('https://ipwho.is/?fields=success,city,country_code,latitude,longitude');
    if (!j?.success) throw new Error("Couldn't detect your location. Type your city instead.");
    p = { lat: j.latitude, lon: j.longitude, name: [j.city, j.country_code].filter(Boolean).join(', ') };
  }
  places.set(key, p);
  return p;
}

/** WMO weather codes, grouped into the handful of looks Lumen draws. */
export function describe(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Clear' };
  if (code === 1) return { kind: 'clear', label: 'Mostly clear' };
  if (code === 2) return { kind: 'cloudy', label: 'Partly cloudy' };
  if (code === 3) return { kind: 'cloudy', label: 'Cloudy' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Fog' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { kind: 'rain', label: 'Rain' };
  if (code >= 71 && code <= 77) return { kind: 'snow', label: 'Snow' };
  if (code >= 80 && code <= 82) return { kind: 'rain', label: 'Showers' };
  if (code === 85 || code === 86) return { kind: 'snow', label: 'Snow showers' };
  if (code >= 95) return { kind: 'storm', label: 'Thunderstorm' };
  return { kind: 'cloudy', label: 'Cloudy' };
}

export async function weather(city: string, unit: 'c' | 'f', force = false): Promise<WeatherInfo> {
  const key = `${city.trim().toLowerCase()}|${unit}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < 15 * 60_000) return cache.info;
  try {
    const p = await findPlace(city);
    const j = await json(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m&temperature_unit=${unit === 'f' ? 'fahrenheit' : 'celsius'}&wind_speed_unit=${unit === 'f' ? 'mph' : 'kmh'}`);
    const c = j?.current;
    if (!c) throw new Error('Weather service sent no data');
    const d = describe(Number(c.weather_code));
    const info: WeatherInfo = { ok: true, place: p.name, temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), wind: Math.round(c.wind_speed_10m), unit, isDay: c.is_day !== 0, kind: d.kind, label: d.label, at: Date.now() };
    cache = { key, at: Date.now(), info };
    return info;
  } catch (e: any) {
    // Keep showing the last good reading for a while if the network drops.
    if (cache && cache.key === key && Date.now() - cache.at < 3 * 3600_000) return cache.info;
    return { ok: false, error: String(e?.message ?? e) };
  }
}
