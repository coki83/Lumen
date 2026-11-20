// Games you own but may not have installed. Each reader is optional and fails quietly into a report.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ScannedGame, Settings, SourceId } from '../../shared/types';
import { env, exists, join, programData, readText } from '../util';

const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
export const normTitle = (t: string) => t.toLowerCase().replace(/[®™©:'’\-–—!.,]/g, '').replace(/\s+/g, ' ').trim();

type SqlDb = { exec(sql: string): { columns: string[]; values: any[][] }[]; close(): void };
let sqlInit: Promise<any> | undefined;
async function openSqlite(file: string): Promise<SqlDb | undefined> {
  if (!(await exists(file))) return undefined;
  // sql.js is pure WebAssembly, so it needs no native build. The launchers keep these files open,
  // so read a copy of the bytes instead of locking the file.
  sqlInit ??= require('sql.js')({ locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f) });
  const SQL = await sqlInit;
  return new SQL.Database(new Uint8Array(await fs.readFile(file)));
}

function rows(db: SqlDb, sql: string): Record<string, any>[] {
  const res = db.exec(sql)[0];
  if (!res) return [];
  return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])));
}

/** Steam Web API: needs the player's own API key and SteamID64 (or profile name). */
export async function steamOwned(key: string, id: string): Promise<ScannedGame[]> {
  if (!key || !id) return [];
  let steamId = id.trim().replace(/^https?:\/\/steamcommunity\.com\/(id|profiles)\//, '').replace(/\/$/, '');
  if (!/^\d{17}$/.test(steamId)) {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(steamId)}`);
    const j: any = await r.json().catch(() => ({}));
    if (j?.response?.success !== 1) throw new Error('Steam could not find that profile name. Use your 17-digit SteamID64.');
    steamId = j.response.steamid;
  }
  const res = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`);
  if (res.status === 401 || res.status === 403) throw new Error('Steam rejected the API key.');
  if (!res.ok) throw new Error(`Steam returned ${res.status}`);
  const j: any = await res.json();
  const games: any[] = j?.response?.games ?? [];
  if (!games.length && j?.response && !('game_count' in j.response)) throw new Error('Steam returned no games. Set Profile → Privacy → Game details to Public.');
  return games.map((g) => ({
    id: `steam:${g.appid}`,
    source: 'steam' as const,
    sourceGameId: String(g.appid),
    title: g.name ?? `App ${g.appid}`,
    launch: { kind: 'url' as const, target: `steam://rungameid/${g.appid}` },
    install: { kind: 'url' as const, target: `steam://install/${g.appid}` },
    art: {
      cover: `${STEAM_CDN}/${g.appid}/library_600x900_2x.jpg`,
      hero: `${STEAM_CDN}/${g.appid}/library_hero.jpg`,
      logo: `${STEAM_CDN}/${g.appid}/logo.png`,
      icon: `${STEAM_CDN}/${g.appid}/header.jpg`
    },
    stats: { minutes: g.playtime_forever || 0, lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : undefined }
  }));
}

/** Epic keeps a base64 JSON copy of your library's catalog entries on disk; no sign-in needed. */
export async function epicOwned(): Promise<ScannedGame[]> {
  const file = join(env('LOCALAPPDATA', ''), 'EpicGamesLauncher', 'Saved', 'Data', 'Catalog', 'catcache.bin');
  const raw = await readText(file);
  if (!raw) return [];
  let items: any[];
  try {
    items = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
  } catch {
    throw new Error('Could not read the Epic library cache');
  }
  const out: ScannedGame[] = [];
  for (const it of Array.isArray(items) ? items : []) {
    const cats: string[] = (it.categories ?? []).map((c: any) => String(c.path ?? c).toLowerCase());
    if (!cats.includes('games') || cats.some((c) => c.startsWith('addons')) || it.mainGameItem) continue;
    const appName = it.releaseInfo?.[0]?.appId;
    if (!appName || !it.title) continue;
    const img = (t: string) => it.keyImages?.find((k: any) => k.type === t)?.url;
    const launchId = `${it.namespace}%3A${it.id}%3A${appName}`;
    out.push({
      id: `epic:${appName}`,
      source: 'epic',
      sourceGameId: appName,
      title: it.title,
      launch: { kind: 'url', target: `com.epicgames.launcher://apps/${launchId}?action=launch&silent=true` },
      install: { kind: 'url', target: `com.epicgames.launcher://apps/${launchId}?action=install` },
      art: { cover: img('DieselGameBoxTall') ?? img('OfferImageTall'), hero: img('DieselGameBox') ?? img('OfferImageWide'), logo: img('DieselGameBoxLogo') }
    });
  }
  return out;
}

const GALAXY_PLATFORMS: Record<string, SourceId> = {
  gog: 'gog', steam: 'steam', epic: 'epic', uplay: 'ubisoft', origin: 'ea', ea: 'ea', xboxone: 'xbox', xbox: 'xbox', battlenet: 'battlenet', amazon: 'amazon'
};
const OPEN_LAUNCHER: Record<SourceId, string> = {
  steam: 'steam://open/games', epic: 'com.epicgames.launcher://store', gog: 'goggalaxy://', ea: 'origin2://library/open',
  ubisoft: 'uplay://', xbox: 'ms-windows-store://downloadsandupdates', battlenet: 'battlenet://', amazon: 'amazon-games://', quiver: '', manual: ''
};

/**
 * GOG Galaxy's local database lists everything you own on GOG, plus every platform you've connected
 * inside Galaxy (Ubisoft, EA, Xbox, Battle.net, PlayStation and more).
 */
export async function galaxyOwned(): Promise<ScannedGame[]> {
  const db = await openSqlite(join(programData(), 'GOG.com', 'Galaxy', 'storage', 'galaxy-2.0.db'));
  if (!db) return [];
  try {
    const titles = rows(db, `
      SELECT gp.releaseKey AS k, gp.value AS v, t.type AS type FROM GamePieces gp
      JOIN GamePieceTypes t ON gp.gamePieceTypeId = t.id
      WHERE t.type IN ('title', 'originalTitle', 'originalImages', 'allGameReleases')
        AND gp.releaseKey IN (SELECT releaseKey FROM LibraryReleases)`);
    const by = new Map<string, { title?: string; images?: any }>();
    for (const r of titles) {
      const e = by.get(r.k) ?? {};
      let v: any = {};
      try { v = JSON.parse(r.v); } catch {}
      if (r.type === 'title' && v.title) e.title = v.title;
      if (r.type === 'originalTitle' && v.title && !e.title) e.title = v.title;
      if (r.type === 'originalImages') e.images = v;
      by.set(r.k, e);
    }
    const out: ScannedGame[] = [];
    for (const [key, e] of by) {
      const m = key.match(/^([a-z0-9]+)_(.+)$/i);
      if (!m || !e.title) continue;
      const source = GALAXY_PLATFORMS[m[1].toLowerCase()];
      if (!source) continue; // platforms Lumen can't launch, e.g. PlayStation
      const gid = m[2];
      const isGog = source === 'gog';
      const isSteam = source === 'steam' && /^\d+$/.test(gid);
      const id = isGog ? `gog:${gid}` : isSteam ? `steam:${gid}` : `galaxy:${key}`;
      const art = { cover: e.images?.verticalCover, hero: e.images?.background, icon: e.images?.squareIcon };
      out.push({
        id,
        source,
        sourceGameId: gid,
        title: e.title,
        launch: isGog ? { kind: 'url', target: `goggalaxy://openGameView/${gid}` } : isSteam ? { kind: 'url', target: `steam://rungameid/${gid}` } : { kind: 'url', target: OPEN_LAUNCHER[source] },
        install: isGog ? { kind: 'url', target: `goggalaxy://openGameView/${gid}` } : isSteam ? { kind: 'url', target: `steam://install/${gid}` } : { kind: 'url', target: OPEN_LAUNCHER[source] },
        art: isSteam ? { ...stripUndef(art), cover: `${STEAM_CDN}/${gid}/library_600x900_2x.jpg`, hero: `${STEAM_CDN}/${gid}/library_hero.jpg` } : stripUndef(art)
      });
    }
    return out;
  } finally {
    db.close();
  }
}

/** The Amazon Games app keeps your entitlements in a local SQLite file. */
export async function amazonOwned(): Promise<ScannedGame[]> {
  const db = await openSqlite(join(env('LOCALAPPDATA', ''), 'Amazon Games', 'Data', 'Games', 'Sql', 'GameProductInfo.sqlite'));
  if (!db) return [];
  try {
    return rows(db, 'SELECT * FROM DbSet')
      .filter((r) => (r.ProductIdStr || r.Id) && r.ProductTitle)
      .map((r) => {
        const pid = String(r.ProductIdStr ?? r.Id);
        return {
          id: `amazon:${pid}`,
          source: 'amazon' as const,
          sourceGameId: pid,
          title: String(r.ProductTitle),
          launch: { kind: 'url' as const, target: `amazon-games://play/${pid}` },
          install: { kind: 'url' as const, target: `amazon-games://play/${pid}` },
          art: stripUndef({ cover: r.ProductIconUrl ?? undefined, hero: r.ProductLogoUrl ?? undefined })
        };
      });
  } finally {
    db.close();
  }
}

function stripUndef<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as T;
}

export interface OwnedReport { source: SourceId; owned: number; error?: string }

export async function scanOwned(settings: Settings, installed: ScannedGame[]): Promise<{ games: ScannedGame[]; reports: OwnedReport[] }> {
  const jobs: [SourceId, () => Promise<ScannedGame[]>][] = [];
  const o = settings.ownedSources;
  if (o.steam && settings.steamApiKey && settings.steamId) jobs.push(['steam', () => steamOwned(settings.steamApiKey, settings.steamId)]);
  if (o.epic) jobs.push(['epic', epicOwned]);
  if (o.galaxy) jobs.push(['gog', galaxyOwned]);
  if (o.amazon) jobs.push(['amazon', amazonOwned]);
  const results = await Promise.all(
    jobs.map(async ([source, fn]) => {
      try {
        return { source, games: await fn() };
      } catch (e: any) {
        return { source, games: [] as ScannedGame[], error: String(e?.message ?? e) };
      }
    })
  );
  // Drop owned entries that duplicate an installed game or another owned entry under a different id
  // (Galaxy's copy of an Epic or Ubisoft game, for example).
  const byId = new Map<string, ScannedGame>();
  const seenTitle = new Map<string, string>();
  for (const g of installed) seenTitle.set(`${g.source}|${normTitle(g.title)}`, g.id);
  const ordered = results.flatMap((r) => r.games).sort((a, b) => Number(a.id.startsWith('galaxy:')) - Number(b.id.startsWith('galaxy:')));
  for (const g of ordered) {
    if (byId.has(g.id)) continue;
    const tk = `${g.source}|${normTitle(g.title)}`;
    const existing = seenTitle.get(tk);
    if (existing && existing !== g.id) continue;
    seenTitle.set(tk, g.id);
    byId.set(g.id, g);
  }
  const games = [...byId.values()];
  const reports = results.map((r) => ({ source: r.source, owned: r.games.length, error: r.error }));
  return { games, reports };
}
