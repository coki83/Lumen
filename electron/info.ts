// Game details from the official Steam store API. SteamDB has no public API and doesn't allow
// scraping, so Lumen links to SteamDB instead of copying from it.
import type { Game, GameInfo } from '../shared/types';
import { normTitle } from './scanners/owned';
import { getInfoCache, setInfoCache } from './store';
import { lookupDetails } from './scraper';

const WEEK = 7 * 24 * 3600 * 1000;
const HOURS6 = 6 * 3600 * 1000;

async function findAppId(title: string): Promise<number | undefined> {
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`);
  if (!r.ok) return undefined;
  const j: any = await r.json();
  const want = normTitle(title);
  const items: any[] = j?.items ?? [];
  return (items.find((i) => normTitle(i.name) === want) ?? items.find((i) => normTitle(i.name).startsWith(want)))?.id;
}

export async function gameInfo(g: Game, refresh = false): Promise<GameInfo | null> {
  const cached = await getInfoCache(g.id);
  // a miss (no Steam match) is kept a week; real info refreshes every 6 hours for price and players
  if (cached && !refresh && Date.now() - cached.at < (cached.data ? HOURS6 : WEEK)) return cached.data;
  const title = g.overrides.title || g.title;
  let appId = g.source === 'steam' && /^\d+$/.test(g.sourceGameId) ? Number(g.sourceGameId) : undefined;
  const byTitle = !appId;
  if (!appId) appId = await findAppId(title).catch(() => undefined);
  if (!appId) {
    await setInfoCache(g.id, null);
    return null;
  }
  const d = await lookupDetails(appId, refresh).catch(() => null);
  const info: GameInfo = { ...(d ?? {}), steamAppId: appId, matchedByTitle: byTitle };
  await setInfoCache(g.id, info);
  return info;
}
