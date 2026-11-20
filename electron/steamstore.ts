// Steam's public store service. It knows every app's real name, type and current artwork paths
// (newer games use hashed image URLs that the old fixed paths miss).
import type { Artwork, PadSupport } from '../shared/types';
import { normTitle } from './scanners/owned';
import { getInfoCache, setInfoCache } from './store';

const ASSET_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
export interface StoreItem { appid: number; name?: string; type?: number; art: Artwork; controller?: PadSupport }

export async function steamItems(ids: number[]): Promise<Map<number, StoreItem>> {
  const out = new Map<number, StoreItem>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const input = { ids: chunk.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true, include_basic_info: true, include_platforms: true } };
    try {
      const r = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      if (!r.ok) continue;
      const j: any = await r.json();
      for (const it of j?.response?.store_items ?? []) {
        if (!it.appid) continue;
        const a = it.assets ?? {};
        const fmt: string | undefined = a.asset_url_format;
        const url = (f?: string) => (fmt && f ? ASSET_BASE + fmt.replace('${FILENAME}', f) : undefined);
        out.set(it.appid, {
          appid: it.appid,
          name: it.name,
          type: it.type,
          controller: padOf(it),
          art: {
            cover: url(a.library_capsule_2x ?? a.library_capsule),
            hero: url(a.library_hero_2x ?? a.library_hero),
            logo: url(a.library_logo ?? a.library_logo_2x),
            icon: url(a.header ?? a.main_capsule)
          }
        });
      }
    } catch {
      /* network hiccup: try the rest */
    }
  }
  return out;
}

/** Steam store category ids: 28 is full controller support, 18 is partial. */
function padFromCats(ids: number[]): PadSupport {
  return ids.includes(28) ? 'full' : ids.includes(18) ? 'partial' : 'none';
}

/** Reads controller support out of a store item. Returns undefined when the item carries no category data at all. */
function padOf(it: any): PadSupport | undefined {
  const c = it?.categories;
  const lists = c && [c.controller_categoryids, c.feature_categoryids, c.supported_player_categoryids].filter(Array.isArray);
  if (lists?.length) {
    const p = padFromCats(lists.flat().map(Number));
    if (p !== 'none') return p;
  }
  // Steam Deck rating as a second opinion: Verified games play fully on a controller.
  const deck = Number(it?.platforms?.steam_deck_compat_category);
  if (deck === 3) return 'full';
  if (deck === 2) return 'partial';
  return lists?.length ? 'none' : undefined;
}

/** Slower per-game lookup on the store page data, for games the bulk call said nothing about. */
export async function steamPad(appid: number): Promise<PadSupport | undefined> {
  try {
    const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=categories`);
    if (!r.ok) return undefined;
    const j: any = await r.json();
    const d = j?.[appid];
    if (!d?.success) return undefined;
    const cats = Array.isArray(d.data?.categories) ? d.data.categories : [];
    return padFromCats(cats.map((x: any) => Number(x.id)));
  } catch {
    return undefined;
  }
}

/** Finds the Steam store entry for a game from another store, by exact title. Cached for a week. */
export async function steamMatch(title: string): Promise<number | undefined> {
  const key = `match:${normTitle(title)}`;
  const c = await getInfoCache(key);
  if (c && Date.now() - c.at < 7 * 86400000) return c.data ?? undefined;
  let id: number | undefined;
  try {
    const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`);
    const j: any = await r.json();
    const want = normTitle(title);
    id = (j?.items ?? []).find((i: any) => normTitle(i.name) === want)?.id;
  } catch {
    return undefined; // don't cache network failures
  }
  await setInfoCache(key, id ?? null);
  return id;
}
