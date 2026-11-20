import type { Artwork, Game, SortKey } from '../../shared/types';
import { t } from './i18n';

export const titleOf = (g: Game) => g.overrides.title || g.title;
export const artOf = (g: Game): Artwork => ({ ...g.art, ...(g.overrides.art ?? {}) });
/** Play time: the larger of what the launcher reports and what Lumen tracked itself. */
export const minutesOf = (g: Game) => Math.max(g.stats?.minutes ?? 0, g.overrides.playMinutes ?? 0);
export const lastPlayedOf = (g: Game) => Math.max(g.stats?.lastPlayed ?? 0, g.overrides.lastPlayed ?? 0) || undefined;

export function sortGames(games: Game[], key: SortKey): Game[] {
  const list = [...games];
  const byTitle = (a: Game, b: Game) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base', numeric: true });
  switch (key) {
    case 'recent':
      return list.sort((a, b) => (lastPlayedOf(b) ?? 0) - (lastPlayedOf(a) ?? 0) || byTitle(a, b));
    case 'added':
      return list.sort((a, b) => (b.overrides.addedAt ?? 0) - (a.overrides.addedAt ?? 0) || byTitle(a, b));
    case 'playtime':
      return list.sort((a, b) => minutesOf(b) - minutesOf(a) || (b.overrides.playCount ?? 0) - (a.overrides.playCount ?? 0) || (lastPlayedOf(b) ?? 0) - (lastPlayedOf(a) ?? 0) || byTitle(a, b));
    case 'source':
      return list.sort((a, b) => a.source.localeCompare(b.source) || byTitle(a, b));
    default:
      return list.sort(byTitle);
  }
}

export function recentGames(games: Game[], n = 12) {
  return games.filter((g) => lastPlayedOf(g) && !g.overrides.hidden).sort((a, b) => lastPlayedOf(b)! - lastPlayedOf(a)!).slice(0, n);
}

export function mostPlayed(games: Game[], n = 14) {
  return games.filter((g) => minutesOf(g) > 0 && !g.overrides.hidden).sort((a, b) => minutesOf(b) - minutesOf(a)).slice(0, n);
}

export function matches(g: Game, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return titleOf(g).toLowerCase().includes(s) || (g.overrides.categories ?? []).some((c) => c.toLowerCase().includes(s));
}

export function timeAgo(ts?: number): string {
  if (!ts) return t('Never');
  const d = Date.now() - ts;
  const m = Math.round(d / 60000);
  if (m < 1) return t('Just now');
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('{n} h ago', { n: h });
  const days = Math.round(h / 24);
  if (days < 30) return t('{n} d ago', { n: days });
  return new Date(ts).toLocaleDateString();
}

export function playtime(mins?: number): string {
  if (!mins) return '—';
  if (mins < 60) return t('{n} min', { n: mins });
  return t('{n} h', { n: (mins / 60).toFixed(mins < 600 ? 1 : 0) });
}

/** A stable hue per title so fallback covers look varied but don't change between runs. */
export function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
