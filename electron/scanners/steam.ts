import type { ScannedGame } from '../../shared/types';
import { ci, exists, join, listDir, parseVdf, readText, regValue } from '../util';

// Tools and runtimes Steam installs that are not games.
const NOT_GAMES = new Set(['228980', '1070560', '1391110', '1493710', '1826330', '1628350', '250820', '1007', '1113280']);
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

export async function steamRoot(custom?: string): Promise<string | undefined> {
  if (custom && (await exists(custom))) return custom;
  const fromReg =
    (await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath')) ??
    (await regValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'));
  if (fromReg) return fromReg.replace(/\//g, '\\');
  const guess = 'C:\\Program Files (x86)\\Steam';
  return (await exists(guess)) ? guess : undefined;
}

/** Every steamapps folder on this PC, the main one and any extra drives. */
export async function steamLibraries(custom?: string): Promise<string[]> {
  const root = await steamRoot(custom);
  if (!root) return [];
  // Windows paths differ only in case and in trailing slashes, and libraryfolders.vdf often
  // lists the main library again. Keyed by a tidied path so the same folder is read once.
  const libraries = new Map<string, string>();
  const add = (dir: string) => {
    const key = dir.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
    if (!libraries.has(key)) libraries.set(key, dir);
  };
  add(join(root, 'steamapps'));
  const lf = await readText(join(root, 'steamapps', 'libraryfolders.vdf'));
  if (lf) {
    const parsed = ci(parseVdf(lf), 'libraryfolders') ?? {};
    for (const v of Object.values<any>(parsed)) {
      const p = typeof v === 'string' ? v : ci(v, 'path');
      if (typeof p === 'string' && p.includes(':')) add(join(p.replace(/\\\\/g, '\\'), 'steamapps'));
    }
  }
  return [...libraries.values()];
}

export async function scanSteam(custom?: string): Promise<ScannedGame[]> {
  const libraries = await steamLibraries(custom);
  const root = await steamRoot(custom);
  if (!root) return [];
  const stats = await localStats(root);
  const games: ScannedGame[] = [];
  const seen = new Set<string>();
  for (const lib of libraries) {
    for (const file of await listDir(lib)) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
      const text = await readText(join(lib, file));
      if (!text) continue;
      const st = ci(parseVdf(text), 'AppState');
      const appid = String(ci(st, 'appid') ?? '');
      const name = String(ci(st, 'name') ?? '');
      if (!appid || !name || NOT_GAMES.has(appid) || seen.has(appid)) continue;
      if (/redistributable|steamvr|proton|steam linux runtime|dedicated server|sdk$/i.test(name)) continue;
      seen.add(appid);
      const installdir = String(ci(st, 'installdir') ?? '');
      games.push({
        id: `steam:${appid}`,
        source: 'steam',
        sourceGameId: appid,
        title: name,
        installDir: installdir ? join(lib, 'common', installdir) : undefined,
        launch: { kind: 'url', target: `steam://rungameid/${appid}` },
        art: {
          cover: `${CDN}/${appid}/library_600x900_2x.jpg`,
          hero: `${CDN}/${appid}/library_hero.jpg`,
          logo: `${CDN}/${appid}/logo.png`,
          icon: `${CDN}/${appid}/header.jpg`
        },
        stats: stats.get(appid)
      });
    }
  }
  return games;
}

/** Play time and last-played dates the Steam client keeps for every user who signed in on this PC. */
async function localStats(root: string): Promise<Map<string, { minutes?: number; lastPlayed?: number }>> {
  const out = new Map<string, { minutes?: number; lastPlayed?: number }>();
  for (const user of await listDir(join(root, 'userdata'))) {
    const text = await readText(join(root, 'userdata', user, 'config', 'localconfig.vdf'));
    if (!text) continue;
    let apps: any;
    try {
      const v = parseVdf(text);
      apps = ci(ci(ci(ci(ci(v, 'UserLocalConfigStore'), 'Software'), 'Valve'), 'Steam'), 'apps');
    } catch {
      continue;
    }
    for (const [id, a] of Object.entries<any>(apps ?? {})) {
      const minutes = Number(ci(a, 'Playtime') ?? 0) || 0;
      const last = Number(ci(a, 'LastPlayed') ?? 0) * 1000 || undefined;
      const prev = out.get(id);
      out.set(id, { minutes: Math.max(prev?.minutes ?? 0, minutes), lastPlayed: Math.max(prev?.lastPlayed ?? 0, last ?? 0) || undefined });
    }
  }
  return out;
}
