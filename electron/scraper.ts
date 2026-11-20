// Lumen's free game scraper. It reads public store data (no accounts, no keys, no paid services):
//  - Steam's own artwork cache on this PC (always matches what the Steam client shows)
//  - artwork from the Steam, Epic and GOG stores by title
//  - Steam store details: price, reviews, tags, players online, screenshots
import path from 'node:path';
import type { ArtSet, ArtSourceId, Artwork, GameInfo, LookupResult } from '../shared/types';
import { gql } from './deals';
import { normTitle } from './scanners/owned';
import { steamRoot } from './scanners/steam';
import { steamItems } from './steamstore';
import { getInfoCache, setInfoCache } from './store';
import { listDir } from './util';
import { promises as fs } from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DAY = 86400000;
const local = (p: string) => `lumen-img://local/?p=${encodeURIComponent(p)}`;

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return r.json();
}

// ---------- Steam's art cache on this PC ----------

function slotOf(file: string): keyof Artwork | undefined {
  const f = file.toLowerCase();
  if (/^library_(600x900|capsule)(_2x)?\.(jpg|png|webp)$/.test(f)) return 'cover';
  if (/^library_hero(_2x)?\.(jpg|png|webp)$/.test(f)) return 'hero';
  if (/^(library_)?logo(_2x)?\.(png|webp)$/.test(f)) return 'logo';
  if (/^header(_2x)?\.(jpg|png|webp)$/.test(f)) return 'icon';
  return undefined;
}

/**
 * Reads Steam\appcache\librarycache. Older Steam keeps files as "<appid>_library_600x900.jpg";
 * newer Steam keeps a folder per game, sometimes with a hashed sub folder inside.
 */
export async function steamLocalArt(customRoot?: string): Promise<Map<string, Artwork>> {
  const out = new Map<string, Artwork>();
  const root = await steamRoot(customRoot).catch(() => undefined);
  if (!root) return out;
  const dir = path.join(root, 'appcache', 'librarycache');
  const put = (id: string, file: string, full: string) => {
    const slot = slotOf(file);
    if (!slot) return;
    const a = out.get(id) ?? {};
    // _2x is sharper; otherwise keep the first one found
    if (!a[slot] || /_2x\./i.test(file)) (a as any)[slot] = local(full);
    out.set(id, a);
  };
  for (const name of await listDir(dir)) {
    const flat = /^(\d+)_(.+)$/.exec(name);
    if (flat) { put(flat[1], flat[2], path.join(dir, name)); continue; }
    if (!/^\d+$/.test(name)) continue;
    const sub = path.join(dir, name);
    for (const f of await listDir(sub)) {
      const full = path.join(sub, f);
      if (slotOf(f)) { put(name, f, full); continue; }
      const st = await fs.stat(full).catch(() => undefined);
      if (st?.isDirectory()) for (const g of await listDir(full)) put(name, g, path.join(full, g));
    }
  }
  return out;
}

// ---------- artwork by title from the stores ----------

async function steamSearch(term: string): Promise<LookupResult[]> {
  const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`);
  return (j?.items ?? []).map((i: any) => ({
    appid: i.id,
    name: i.name,
    image: i.tiny_image,
    price: i.price ? (i.price.final === 0 ? 'Free' : `${(i.price.final / 100).toFixed(2)} ${i.price.currency}`) : undefined
  }));
}

async function steamArtSets(term: string): Promise<ArtSet[]> {
  const hits = (await steamSearch(term)).slice(0, 5);
  const items = await steamItems(hits.map((h) => h.appid));
  return hits.map((h) => ({ store: 'Steam' as const, name: h.name, ...(items.get(h.appid)?.art ?? {}) })).filter((s) => s.cover || s.hero);
}

async function epicArtSets(term: string): Promise<ArtSet[]> {
  const q = `query($kw: String, $country: String!) { Catalog { searchStore(keywords: $kw, country: $country, count: 6, category: "games/edition/base|bundles/games|editors") { elements { title keyImages { type url } } } } }`;
  const d = await gql(q, { kw: term, country: 'US' });
  return (d?.Catalog?.searchStore?.elements ?? []).map((e: any) => {
    const k = (...t: string[]) => t.map((x) => e.keyImages?.find((i: any) => i.type === x)?.url).find(Boolean);
    return { store: 'Epic' as const, name: e.title, cover: k('OfferImageTall', 'DieselGameBoxTall'), hero: k('DieselStoreFrontWide', 'OfferImageWide', 'DieselGameBox'), logo: k('DieselGameBoxLogo') };
  }).filter((s: ArtSet) => s.cover || s.hero);
}

async function gogArtSets(term: string): Promise<ArtSet[]> {
  const j = await getJson(`https://catalog.gog.com/v1/catalog?limit=6&query=like:${encodeURIComponent(term)}&order=desc:score&productType=in:game,pack&locale=en-US`);
  return (j?.products ?? []).map((p: any) => ({
    store: 'GOG' as const,
    name: p.title,
    cover: p.coverVertical || undefined,
    hero: p.coverHorizontal || undefined,
    logo: p.logo || undefined
  })).filter((s: ArtSet) => s.cover || s.hero);
}

/** Box art from the game's Wikipedia article. */
async function wikiArtSets(term: string): Promise<ArtSet[]> {
  const j = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(`${term} video game`)}&gsrlimit=6&prop=pageimages&piprop=original&pilicense=any&redirects=1`);
  const pages: any[] = Object.values(j?.query?.pages ?? {}).sort((x: any, y: any) => (x.index ?? 0) - (y.index ?? 0));
  return pages
    .filter((p) => p.original?.source && /\.(jpe?g|png|webp)$/i.test(p.original.source))
    .map((p) => {
      const tall = p.original.height >= p.original.width;
      // "Hades (video game)" -> "Hades"
      return { store: 'Wikipedia' as const, name: String(p.title).replace(/\s*\((\d{4} )?video game\)$/i, ''), cover: tall ? p.original.source : undefined, hero: tall ? undefined : p.original.source };
    });
}

/** A general web image search for "<game> game cover". Last resort: it can pick a wrong picture. */
async function webArtSets(term: string): Promise<ArtSet[]> {
  const q = `${term} game cover art`;
  const html = await (await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, { headers: { 'User-Agent': UA } })).text();
  const vqd = /vqd=["']?([\d-]+)/.exec(html)?.[1];
  if (!vqd) throw new Error('image search token not found');
  const j = await getJson(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`, { headers: { Referer: 'https://duckduckgo.com/', Accept: 'application/json' } });
  const want = normTitle(term);
  const out: ArtSet[] = [];
  for (const r of j?.results ?? []) {
    if (!r.image || !r.width || !r.height) continue;
    const ratio = r.width / r.height;
    const named = normTitle(String(r.title ?? '')).includes(want);
    if (ratio >= 0.55 && ratio <= 0.85 && r.height >= 400) out.push({ store: 'Web search', name: named ? term : String(r.title ?? term).slice(0, 60), cover: r.thumbnail || r.image, icon: r.image });
    else if (ratio >= 1.6 && r.width >= 900) out.push({ store: 'Web search', name: named ? term : String(r.title ?? term).slice(0, 60), hero: r.image });
    if (out.length >= 10) break;
  }
  return out;
}

type Sources = Partial<Record<ArtSourceId, boolean>>;
const on = (src: Sources | undefined, id: ArtSourceId) => src?.[id] !== false;

/** Every artwork set the enabled scrapers have for a title. Sources that fail are skipped. */
export async function freeArt(term: string, src?: Sources): Promise<ArtSet[]> {
  const jobs = [
    on(src, 'steamStore') ? steamArtSets(term) : [],
    on(src, 'epic') ? epicArtSets(term) : [],
    on(src, 'gog') ? gogArtSets(term) : [],
    on(src, 'wikipedia') ? wikiArtSets(term) : [],
    on(src, 'web') ? webArtSets(term) : []
  ];
  const res = await Promise.allSettled(jobs);
  const sets = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const want = normTitle(term);
  // exact title matches first, then the rest in source order
  return [...sets.filter((s) => normTitle(s.name) === want), ...sets.filter((s) => normTitle(s.name) !== want)];
}

/** Artwork for a library game: only an exact title match, so we never put the wrong game's art on a card. */
export async function autoFreeArt(title: string, src?: Sources, force = false): Promise<Artwork | undefined> {
  const key = `freeart:${normTitle(title)}`;
  const c = await getInfoCache(key);
  // found art is kept a week; a miss is retried when asked to (Find missing artwork now)
  if (c && Date.now() - c.at < 7 * DAY && (c.data || !force)) return c.data ?? undefined;
  let sets: ArtSet[];
  try { sets = await freeArt(title, src); } catch { return undefined; }
  const want = normTitle(title);
  const exact = sets.filter((s) => normTitle(s.name) === want);
  const best = exact.find((s) => s.cover) ?? exact[0];
  const art: Artwork | undefined = best
    ? { cover: best.cover, hero: best.hero ?? exact.find((s) => s.hero)?.hero, logo: best.logo ?? exact.find((s) => s.logo)?.logo, icon: best.store === 'Web search' ? undefined : best.icon,
        alts: exact.filter((s) => s.cover && s.cover !== best.cover).map((s) => s.cover!).slice(0, 4) }
    : undefined;
  await setInfoCache(key, art ?? null);
  return art;
}

// ---------- Steam store details (the "scraper") ----------

export async function lookup(query: string): Promise<LookupResult[]> {
  if (/^\d+$/.test(query.trim())) {
    const id = Number(query.trim());
    const d = await lookupDetails(id).catch(() => null);
    return d?.name ? [{ appid: id, name: d.name, image: d.header, price: d.price?.final }] : [];
  }
  return steamSearch(query);
}

async function reviews(appid: number): Promise<GameInfo['reviews']> {
  const j = await getJson(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0&filter=summary`);
  const q = j?.query_summary;
  if (!q?.total_reviews) return undefined;
  return { summary: q.review_score_desc, positive: q.total_positive, total: q.total_reviews, percent: Math.round((q.total_positive / q.total_reviews) * 100) };
}

async function players(appid: number): Promise<number | undefined> {
  const j = await getJson(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`);
  return j?.response?.result === 1 ? j.response.player_count : undefined;
}

/** User tags only appear on the store page itself. */
async function tags(appid: number): Promise<string[] | undefined> {
  const r = await fetch(`https://store.steampowered.com/app/${appid}/?l=english`, {
    headers: { 'User-Agent': UA, Cookie: 'birthtime=0; lastagecheckage=1-0-1990; mature_content=1; wants_mature_content=1' }
  });
  if (!r.ok) return undefined;
  const html = await r.text();
  const out: string[] = [];
  for (const m of html.matchAll(/class="app_tag"[^>]*>\s*([^<]+?)\s*</g)) if (m[1] !== '+') out.push(m[1].replace(/&amp;/g, '&'));
  return out.length ? out.slice(0, 15) : undefined;
}

const strip = (html: string) =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();

/** Everything we can learn about one Steam app. Cached for 6 hours (players change faster, so they're refreshed). */
export async function lookupDetails(appid: number, refresh = false): Promise<GameInfo | null> {
  const key = `steamapp:${appid}`;
  const c = await getInfoCache(key);
  if (c && !refresh && Date.now() - c.at < DAY / 4) return c.data;
  const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=US`).catch(() => null);
  const d = j?.[appid]?.success ? j[appid].data : null;
  const [rv, pl, tg] = await Promise.allSettled([reviews(appid), players(appid), tags(appid)]);
  const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : undefined);
  if (!d && !val(rv)) return null;
  const po = d?.price_overview;
  const info: GameInfo = {
    steamAppId: appid,
    name: d?.name,
    description: d ? strip(d.short_description || d.about_the_game || '') : undefined,
    developers: d?.developers,
    publishers: d?.publishers,
    genres: (d?.genres ?? []).map((x: any) => x.description),
    features: (d?.categories ?? []).map((x: any) => x.description).slice(0, 10),
    releaseDate: d?.release_date?.date,
    metacritic: d?.metacritic?.score,
    screenshots: (d?.screenshots ?? []).slice(0, 8).map((s: any) => s.path_full),
    website: d?.website || undefined,
    header: d?.header_image,
    price: d?.is_free ? { free: true, final: 'Free' } : po ? { final: po.final_formatted, initial: po.discount_percent ? po.initial_formatted : undefined, discount: po.discount_percent || undefined } : undefined,
    platforms: d?.platforms ? Object.entries(d.platforms).filter(([, v]) => v).map(([k]) => (k === 'windows' ? 'Windows' : k === 'mac' ? 'macOS' : 'Linux')) : undefined,
    achievements: d?.achievements?.total || undefined,
    dlcCount: d?.dlc?.length || undefined,
    reviews: val(rv),
    currentPlayers: val(pl),
    tags: val(tg)
  };
  await setInfoCache(key, info);
  return info;
}
