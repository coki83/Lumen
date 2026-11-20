// "What's happening": the gaming headlines, the week's new releases, and the games the whole world
// is playing right now.
//
// The headlines come from Google News' gaming topic, which is the whole industry rather than the
// Steam pages of the player's own games. The other two come from Steam's own public services. All
// of it needs no key and no account, and nothing about the player is sent: the Google call carries
// only a topic and a language, and the Steam fallback below only the app ids of games already in
// the library.
import type { PulseItem, PulseKind } from '../shared/types';
import { app } from 'electron';
import { getLibrary, getSettings } from './store';
import { gamingNews } from './gnews';
import { newsLang, readableIn } from './newslang';
import { steamItems } from './steamstore';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TTL = 30 * 60 * 1000; // half an hour is plenty: none of this changes by the minute
const cache = new Map<PulseKind, { at: number; items: PulseItem[] }>();

const header = (appid: number | string) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
const storeUrl = (appid: number | string) => `https://store.steampowered.com/app/${appid}/`;

/** Steam's news bodies are BBCode and HTML. The card only has room for a line of plain text. */
function plain(s: string, max = 180): string {
  const text = (s ?? '')
    .replace(/\[\/?[a-z][^\]]*\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const agoOf = (seconds: number) => {
  const mins = Math.max(1, Math.round((Date.now() - seconds * 1000) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
};

const played = (g: { stats?: { lastPlayed?: number }; overrides: { lastPlayed?: number } }) =>
  Math.max(g.stats?.lastPlayed ?? 0, g.overrides.lastPlayed ?? 0);

/**
 * The gaming headlines, from Google News. Should that feed be unreachable, the news of the player's
 * own Steam games stands in: older and narrower, but better than an empty card.
 */
async function news(): Promise<PulseItem[]> {
  const lang = newsLang((await getSettings()).newsLanguage, app.getLocale?.() ?? 'en');
  const headlines = await gamingNews(lang).catch(() => [] as PulseItem[]);
  return headlines.length ? headlines : ownGameNews();
}

/** News for the Steam games in your library, newest first, at most one item per game. */
async function ownGameNews(): Promise<PulseItem[]> {
  const lib = await getLibrary();
  const mine = lib.games
    .filter((g) => g.source === 'steam' && /^\d+$/.test(g.sourceGameId) && !g.overrides.hidden)
    .sort((a, b) => played(b) - played(a))
    .slice(0, 12);
  if (!mine.length) return [];
  const lang = newsLang((await getSettings()).newsLanguage, app.getLocale?.() ?? 'en');
  const month = Date.now() / 1000 - 45 * 86_400;
  const out: PulseItem[] = [];
  await Promise.all(mine.map(async (g) => {
    try {
      // Several items per game, because the newest one is often in a language this player does
      // not read, and the same announcement is usually posted again in others.
      const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${g.sourceGameId}&count=8&maxlength=400&format=json`;
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) return;
      const j: any = await r.json();
      const fresh = (j?.appnews?.newsitems ?? []).filter((n: any) => n?.title && n.date > month);
      const item = fresh.find((n: any) => readableIn(`${n.title} ${plain(n.contents, 400)}`, lang));
      if (!item) return;
      const sub = plain(item.contents);
      out.push({
        id: `news:${item.gid ?? `${g.sourceGameId}:${item.date}`}`,
        title: item.title,
        sub: readableIn(sub, lang) ? sub : undefined,
        meta: `${g.overrides.title ?? g.title} · ${agoOf(Number(item.date))}`,
        image: header(g.sourceGameId),
        url: item.url || storeUrl(g.sourceGameId),
        at: Number(item.date) * 1000
      });
    } catch {
      /* one game's feed failing should not take the rest down */
    }
  }));
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 8);
}

/** What came out on Steam in the last days. */
async function releases(): Promise<PulseItem[]> {
  const r = await fetch('https://store.steampowered.com/api/featuredcategories?l=english', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam returned ${r.status}`);
  const j: any = await r.json();
  const seen = new Set<number>();
  return (j?.new_releases?.items ?? [])
    .filter((i: any) => i?.id && i.type === 0 && !seen.has(i.id) && seen.add(i.id))
    .slice(0, 10)
    .map((i: any) => ({
      id: `new:${i.id}`,
      title: i.name,
      meta: i.final_price === 0 ? 'Free to play' : undefined,
      image: i.header_image || i.large_capsule_image || header(i.id),
      url: storeUrl(i.id)
    }));
}

/** Steam's own most played chart, with the names and artwork filled in from the store service. */
async function world(): Promise<PulseItem[]> {
  const r = await fetch('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam returned ${r.status}`);
  const j: any = await r.json();
  const ranks = (j?.response?.ranks ?? []).slice(0, 10);
  if (!ranks.length) return [];
  const names = await steamItems(ranks.map((x: any) => Number(x.appid)).filter(Boolean)).catch(() => new Map());
  const players = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M playing` : n >= 1000 ? `${Math.round(n / 1000)}k playing` : `${n} playing`);
  return ranks.map((x: any, i: number) => ({
    id: `world:${x.appid}`,
    title: names.get(Number(x.appid))?.name ?? `App ${x.appid}`,
    meta: `#${x.rank ?? i + 1} · ${players(Number(x.concurrent_in_game ?? x.peak_in_game ?? 0))}`,
    image: names.get(Number(x.appid))?.art.icon ?? header(x.appid),
    url: storeUrl(x.appid)
  }));
}

/**
 * One list for the vibes card. A failed call keeps the last good list rather than emptying the
 * card, since a few hours old headlines still read better than nothing.
 */
export async function pulse(kind: PulseKind, refresh = false): Promise<PulseItem[]> {
  const hit = cache.get(kind);
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.items;
  try {
    const items = kind === 'news' ? await news() : kind === 'releases' ? await releases() : await world();
    if (items.length) cache.set(kind, { at: Date.now(), items });
    return items.length ? items : hit?.items ?? [];
  } catch {
    return hit?.items ?? [];
  }
}
