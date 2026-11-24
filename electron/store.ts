import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Artwork, Game, GameOverrides, LibraryState, PadSupport, ScannedGame, ScanReport, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from './defaults';

interface DiskLibrary {
  version: 1;
  /** Last known scan data per game, so a game stays visible (as not installed) if a scan misses it. */
  scanned: Record<string, ScannedGame>;
  overrides: Record<string, GameOverrides>;
  manual: Record<string, ScannedGame>;
  categories: string[];
  installed: string[];
  owned?: string[];
  /** Controller support per game id, kept apart from scan data so rescans don't lose it. */
  controller?: Record<string, PadSupport>;
  lastScan?: number;
  reports: ScanReport[];
}

const dataDir = () => app.getPath('userData');
const libFile = () => path.join(dataDir(), 'library.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');
export const artDir = () => path.join(dataDir(), 'artwork');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

let tmpCount = 0;
async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // A unique temp name: two writes landing together must not share one, or the first rename
  // would move a file the second is still writing and the saved copy would be half a file.
  const tmp = `${file}.${process.pid}.${tmpCount++}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

let lib: DiskLibrary | undefined;
let settings: Settings | undefined;

const obj = <T>(v: any, fallback: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? v : fallback);

async function loadLib(): Promise<DiskLibrary> {
  if (!lib) {
    lib = await readJson<DiskLibrary>(libFile(), {
      version: 1,
      scanned: {},
      overrides: {},
      manual: {},
      categories: ['Co-op', 'Backlog', 'Finished'],
      installed: [],
      reports: []
    });
    // A library file that got damaged should cost you your notes, not the whole app: put back
    // whatever still reads as the right shape and start the rest empty.
    lib.scanned = obj(lib.scanned, {});
    lib.overrides = obj(lib.overrides, {});
    lib.manual = obj(lib.manual, {});
    lib.controller = obj(lib.controller, {});
    if (!Array.isArray(lib.categories)) lib.categories = ['Co-op', 'Backlog', 'Finished'];
    if (!Array.isArray(lib.installed)) lib.installed = [];
    if (lib.owned && !Array.isArray(lib.owned)) lib.owned = [];
    if (!Array.isArray(lib.reports)) lib.reports = [];
  }
  return lib;
}

const saveLib = () => writeJson(libFile(), lib);

export async function getSettings(): Promise<Settings> {
  if (!settings) {
    const disk = await readJson<Partial<Settings>>(settingsFile(), {});
    settings = {
      ...DEFAULT_SETTINGS,
      ...disk,
      enabledSources: { ...DEFAULT_SETTINGS.enabledSources, ...(disk.enabledSources ?? {}) },
      customPaths: { ...(disk.customPaths ?? {}) },
      ownedSources: { ...DEFAULT_SETTINGS.ownedSources, ...(disk.ownedSources ?? {}) },
      keyBindings: { ...DEFAULT_SETTINGS.keyBindings, ...(disk.keyBindings ?? {}) },
      padBindings: { ...DEFAULT_SETTINGS.padBindings, ...(disk.padBindings ?? {}) },
      shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(disk.shortcuts ?? {}) }
    };
    // A settings file edited by hand (or left half-written by a power cut) must not stop Lumen
    // from starting: anything that does not look right falls back to the default.
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      const mine = (settings as any)[k];
      if (Array.isArray(v) && !Array.isArray(mine)) (settings as any)[k] = [...v];
      else if (v !== null && typeof v === 'object' && (mine === null || typeof mine !== 'object')) (settings as any)[k] = { ...(v as object) };
      else if (typeof v === 'number' && typeof mine !== 'number') (settings as any)[k] = v;
    }
    try {
      // The Photo tile style was dropped; a saved copy of it falls back to Classic.
      // styles that have been taken out again fall back rather than leaving a tile with no look
      if (['polaroid', 'cd', 'tape'].includes(settings.cardStyle as string)) settings.cardStyle = 'classic';
      // v2: most played first by default, and a "Most played" row on the Big Screen home.
      if ((settings.settingsVersion ?? 1) < 2) {
        if (settings.sort === 'title') settings.sort = 'playtime';
        if (!settings.bigScreenRows.includes('mostPlayed')) settings.bigScreenRows = ['recent', 'mostPlayed', ...settings.bigScreenRows.filter((r) => r !== 'recent')];
        settings.settingsVersion = 2;
      }
      // v3: the cinematic shell. Anyone still on the old default palette moves to the new one,
      // and the sidebar starts as the floating rail; a theme you picked yourself is left alone.
      if ((settings.settingsVersion ?? 1) < 3) {
        if (settings.theme === 'ember') settings.theme = 'noir';
        settings.sidebarCollapsed = true;
        settings.settingsVersion = 3;
        // Written straight away: the new theme and rail have to survive the next launch,
        // and Settings should show the theme that is actually in use.
        await writeJson(settingsFile(), settings);
      }
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
  }
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = await getSettings();
  settings = { ...s, ...patch };
  await writeJson(settingsFile(), settings);
  return settings;
}

function compose(l: DiskLibrary): Game[] {
  const installed = new Set(l.installed);
  const owned = new Set(l.owned ?? []);
  const pad = l.controller ?? {};
  const games: Game[] = [];
  for (const g of Object.values(l.scanned)) {
    games.push({ ...g, controller: pad[g.id], overrides: l.overrides[g.id] ?? {}, installed: installed.has(g.id), owned: owned.has(g.id) });
  }
  for (const g of Object.values(l.manual)) {
    games.push({ ...g, controller: pad[g.id], overrides: l.overrides[g.id] ?? {}, installed: true, owned: true });
  }
  return games;
}

export async function getLibrary(): Promise<LibraryState> {
  const l = await loadLib();
  return { games: compose(l), categories: l.categories, lastScan: l.lastScan, reports: l.reports };
}

export async function applyScan(found: ScannedGame[], ownedFound: ScannedGame[], reports: ScanReport[]): Promise<LibraryState> {
  const l = await loadLib();
  const now = Date.now();
  // Sources that failed keep their previous "installed" state instead of vanishing.
  const failed = new Set(reports.filter((r) => r.error).map((r) => r.source));
  const keep = l.installed.filter((id) => failed.has(l.scanned[id]?.source as any));
  for (const g of found) {
    const prev = l.scanned[g.id];
    // Keep art the scanner could not provide but we fetched before.
    l.scanned[g.id] = { ...g, art: mergeArt(prev?.art, g.art) };
    if (!l.overrides[g.id]) l.overrides[g.id] = { addedAt: now };
  }
  // installed scan data first; owned data below may add launcher play time
  l.installed = [...new Set([...keep, ...found.map((g) => g.id)])];
  const inst = new Set(l.installed);
  // Owned but not installed. Installed data wins; owned data only adds the install link and art.
  for (const g of ownedFound) {
    const prev = l.scanned[g.id];
    if (inst.has(g.id) && prev) {
      prev.install = g.install;
      if (g.stats) prev.stats = { minutes: Math.max(prev.stats?.minutes ?? 0, g.stats.minutes ?? 0), lastPlayed: Math.max(prev.stats?.lastPlayed ?? 0, g.stats.lastPlayed ?? 0) || undefined };
      if (/^(Steam app|App) \d+$/.test(prev.title) && g.title) prev.title = g.title;
      prev.art = mergeArt(prev.art, g.art);
      continue;
    }
    l.scanned[g.id] = { ...g, art: mergeArt(prev?.art, g.art) };
    if (!l.overrides[g.id]) l.overrides[g.id] = { addedAt: now };
  }
  // A launcher whose owned list failed this time keeps last time's list instead of losing it.
  const ownedFailed = new Set(reports.filter((r) => r.ownedError).map((r) => r.source));
  const keepOwned = (l.owned ?? []).filter((id) => ownedFailed.has(l.scanned[id]?.source as any));
  l.owned = [...new Set([...keepOwned, ...ownedFound.map((g) => g.id)])].filter((id) => !inst.has(id));
  // Forget games that are neither installed nor owned any more, unless you made them yours somehow.
  const ownedSet = new Set(l.owned);
  for (const [id, g] of Object.entries(l.scanned)) {
    if (inst.has(id) || ownedSet.has(id) || keep.includes(id)) continue;
    const o = l.overrides[id] ?? {};
    const personal = o.favorite || o.categories?.length || o.playCount || o.title || o.notes || (o.art && Object.keys(o.art).length);
    if (!personal || /^(Steam app|App) \d+$/.test(g.title)) {
      delete l.scanned[id];
      delete l.overrides[id];
    }
  }
  l.lastScan = now;
  l.reports = reports;
  await saveLib();
  return getLibrary();
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => (Array.isArray(v) ? v.length : v))) as Partial<T>;
}

/** Combines two sets of art. `main` wins; covers it pushes aside are kept as fallbacks to try if it fails to load. */
export function mergeArt(main: Artwork = {}, other: Artwork = {}): Artwork {
  const m = stripEmpty(main), o = stripEmpty(other);
  const out: Artwork = { ...o, ...m };
  const alts = [...(m.alts ?? []), o.cover, ...(o.alts ?? [])].filter((u): u is string => !!u && u !== out.cover);
  out.alts = [...new Set(alts)].slice(0, 6);
  if (!out.alts.length) delete out.alts;
  return out;
}

export async function setControllerMany(updates: { id: string; controller: PadSupport }[]) {
  if (!updates.length) return;
  const l = await loadLib();
  l.controller ??= {};
  for (const u of updates) l.controller[u.id] = u.controller;
  await saveLib();
}

export async function setScannedArtMany(updates: { id: string; art: Partial<ScannedGame['art']>; replace?: boolean }[]) {
  const l = await loadLib();
  for (const u of updates) {
    const g = l.scanned[u.id] ?? l.manual[u.id];
    if (g) g.art = u.replace ? mergeArt(u.art, g.art) : mergeArt(g.art, u.art);
  }
  await saveLib();
}

export async function setScannedArt(id: string, art: Partial<ScannedGame['art']>) {
  const l = await loadLib();
  const g = l.scanned[id] ?? l.manual[id];
  if (!g) return;
  g.art = mergeArt(art, g.art);
  await saveLib();
}

export async function updateOverrides(id: string, patch: GameOverrides): Promise<Game | undefined> {
  const l = await loadLib();
  const cur = l.overrides[id] ?? {};
  const next: GameOverrides = { ...cur, ...patch };
  if (patch.art) next.art = { ...(cur.art ?? {}), ...patch.art };
  // Empty strings clear an override.
  if (next.art) next.art = stripEmpty(next.art);
  if (next.title === '') delete next.title;
  l.overrides[id] = next;
  for (const c of next.categories ?? []) if (!l.categories.includes(c)) l.categories.push(c);
  await saveLib();
  return compose(l).find((g) => g.id === id);
}

export async function addManual(game: ScannedGame): Promise<Game> {
  const l = await loadLib();
  l.manual[game.id] = game;
  l.overrides[game.id] = { addedAt: Date.now() };
  await saveLib();
  return compose(l).find((g) => g.id === game.id)!;
}

export async function removeGame(id: string) {
  const l = await loadLib();
  delete l.manual[id];
  delete l.scanned[id];
  delete l.overrides[id];
  l.installed = l.installed.filter((x) => x !== id);
  l.owned = (l.owned ?? []).filter((x) => x !== id);
  await saveLib();
}

export async function setCategories(categories: string[]) {
  const l = await loadLib();
  l.categories = categories;
  const allowed = new Set(categories);
  for (const o of Object.values(l.overrides)) if (o.categories) o.categories = o.categories.filter((c) => allowed.has(c));
  await saveLib();
}

export async function findGame(id: string): Promise<Game | undefined> {
  return compose(await loadLib()).find((g) => g.id === id);
}

const infoFile = () => path.join(dataDir(), 'gameinfo.json');
let info: Record<string, { at: number; data: any }> | undefined;
export async function getInfoCache(id: string): Promise<{ at: number; data: any } | undefined> {
  info ??= await readJson(infoFile(), {});
  return info[id];
}
export async function setInfoCache(id: string, data: any) {
  info ??= await readJson(infoFile(), {});
  info[id] = { at: Date.now(), data };
  await writeJson(infoFile(), info);
}
