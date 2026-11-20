import './net'; // gives every fetch a deadline; must come before anything that uses one
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, net, powerMonitor, protocol, session, shell } from 'electron';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { AccountId, GameOverrides, LibraryState, PadSupport, PowerAction, PulseKind, Settings, SourceId } from '../shared/types';
import { gameInfo } from './info';
import { accountGames, accountsInfo, signIn, signOut } from './accounts';
import { deals } from './deals';
import { pulse } from './pulse';
import { drives } from './disk';
import { padBatteries } from './padbattery';
import { temps, tempsNote } from './temps';
import { steamItems, steamMatch, steamPad } from './steamstore';
import { clearDownload, downloads, lastDownloads, noteInstallStarted } from './downloads';
import { padCursor, stopPadCursor } from './cursor';
import { tuckLauncher } from './launcherwin';
import { uninstallGame } from './uninstall';
import { achievementsFor } from './achievements';
import { launcherIcons } from './icons';
import { downloadsPageName, openDownloadsPage, openLauncherLink } from './handoff';
import { weather } from './weather';
import { couchOpen, couchSetup, couchStatus, registerLink, wantsBig, BIG_ARG } from './couch';
import { autoArt, listArt, searchArt } from './art';
import { autoFreeArt, freeArt, lookup, lookupDetails, steamLocalArt } from './scraper';
import { scanAll } from './scanners';
import { gogArt } from './scanners/gog';
import { normTitle, scanOwned } from './scanners/owned';
import * as store from './store';

const MEDIA_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.avif', '.mp3', '.ogg', '.wav', '.flac', '.m4a', '.opus', '.mp4', '.webm', '.mkv', '.mov']);

protocol.registerSchemesAsPrivileged([
  { scheme: 'lumen-img', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win: BrowserWindow | undefined;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  // Started again with --bigscreen or lumen://bigscreen (a couch shortcut, OmniConsole, a controller tool).
  if (wantsBig(argv)) goBig();
});

function goBig() {
  if (!win) return;
  win.setFullScreen(true);
  win.webContents.executeJavaScript("location.hash = 'bigscreen'").catch(() => undefined);
}

async function createWindow() {
  const settings = await store.getSettings();
  const big = settings.startInBigScreen || wantsBig(process.argv);
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0b10',
    title: 'Lumen',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    fullscreen: big,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      webviewTag: true
    }
  });
  // F11 always toggles full screen, so the window can never get stuck.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win?.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) await win.loadURL(`${dev}${big ? '#bigscreen' : ''}`);
  else await win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), { hash: big ? 'bigscreen' : '' });
}

/** After handing an install to a launcher, bring Lumen back to the front so it stays the thing you look at. */
function keepFocus() {
  const grab = () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    setTimeout(() => !win?.isDestroyed() && win?.setAlwaysOnTop(false), 1200);
  };
  for (const ms of [400, 1500, 3500, 6000]) setTimeout(grab, ms);
}

let bigScreenOn = false;
let padWatch: string | null = null;
let padUntil = 0;
/** An uninstall we lent the pad to: it ends when this game stops being installed. */
let padGone: string | null = null;
/** Installs we started: when the launcher really begins downloading, Lumen takes the screen back. */
const comeBack = new Map<string, number>();
let dlTimer: NodeJS.Timeout | null = null;
let dlWas = '';
/** Watches the launchers' own download progress while something is going on, then goes quiet. */
async function pollDownloads(force = false) {
  if (!win || win.isDestroyed()) return;
  const settings = await store.getSettings();
  const lib = await store.getLibrary();
  const list = await downloads(settings.customPaths?.steam, lib.games.filter((g) => g.installed).map((g) => g.id)).catch(() => []);
  const key = JSON.stringify(list.map((d) => [d.gameId, d.state, d.percent, Math.round((d.bytesPerSecond ?? 0) / 100000)]));
  const was = dlWas;
  // The install box has been answered (or too much time has passed): give the mouse back.
  // The pad is lent to the launcher's own window until its box has been answered: for an install
  // that is when bytes start moving, for an uninstall it is when the game is no longer installed.
  const gone = padGone ? !lib.games.some((g) => g.id === padGone && g.installed) : false;
  if (padWatch && (list.some((d) => d.gameId === padWatch && d.state !== 'starting') || gone || Date.now() > padUntil)) {
    padWatch = null;
    padGone = null;
    stopPadCursor();
  }
  // The launcher is downloading on its own now, so its window goes down and Lumen comes back up,
  // instead of leaving you looking at Steam. Forgotten after ten minutes if nothing ever started.
  for (const [id, until] of comeBack) {
    if (Date.now() > until) { comeBack.delete(id); continue; }
    const live = list.find((d) => d.gameId === id && d.state !== 'starting');
    if (!live) continue;
    comeBack.delete(id);
    if (settings.stayInLumen === false) continue;
    tuckLauncher(live.source, 8).catch(() => undefined);
    keepFocus();
  }
  if (key !== dlWas || force) {
    dlWas = key;
    win.webContents.send('downloads:changed', list);
  }
  // A download that just vanished usually means the game finished installing.
  if (!list.length && was && was !== '[]') doScan().then(broadcast).catch(() => undefined);
  if (dlTimer) clearTimeout(dlTimer);
  dlTimer = setTimeout(() => pollDownloads(), list.length ? 1500 : 8000);
}

function broadcast(state: LibraryState) {
  win?.webContents.send('library:changed', state);
}

/** Fill in missing artwork after a scan, without blocking the scan result. */
const hasCover = (g: { art: { cover?: string }; overrides: { art?: { cover?: string } } }) => !!(g.overrides.art?.cover || g.art.cover);
let enriching: Promise<void> | null = null;

/** Fills in artwork after a scan, best source first. Runs once at a time. */
function enrichArt(state: LibraryState, settings: Settings, force = false): Promise<void> {
  if (!enriching) enriching = doEnrich(state, settings, force).finally(() => { enriching = null; });
  return enriching;
}

/** Controller support for games that still have none: match other stores' games to Steam, then ask per game. Gentle on Steam's limits. */
async function enrichPads() {
  const games = (await store.getLibrary()).games.filter((g) => !g.controller);
  const ids = new Map<string, number>();
  for (const g of games) if (g.source === 'steam' && /^\d+$/.test(g.sourceGameId)) ids.set(g.id, Number(g.sourceGameId));
  const others = games.filter((g) => g.source !== 'steam').slice(0, 400);
  for (let i = 0; i < others.length; i += 4) {
    const batch = others.slice(i, i + 4);
    const found = await Promise.all(batch.map((g) => steamMatch(g.overrides.title || g.title).catch(() => undefined)));
    batch.forEach((g, k) => found[k] && ids.set(g.id, found[k]!));
  }
  if (!ids.size) return;
  const items = await steamItems([...new Set(ids.values())]).catch(() => new Map());
  const ups: { id: string; controller: PadSupport }[] = [];
  const slow: [string, number][] = [];
  for (const [id, appid] of ids) {
    const c = items.get(appid)?.controller;
    if (c) ups.push({ id, controller: c }); else slow.push([id, appid]);
  }
  await store.setControllerMany(ups);
  if (ups.length) broadcast(await store.getLibrary());
  // The store page data allows about 200 questions per 5 minutes, so go one at a time and stop early.
  let done = 0;
  for (const [id, appid] of slow.slice(0, 120)) {
    const c = await steamPad(appid);
    if (c) { await store.setControllerMany([{ id, controller: c }]); done++; }
    if (done && done % 20 === 0) broadcast(await store.getLibrary());
    await new Promise((r) => setTimeout(r, 1600));
  }
  if (done) broadcast(await store.getLibrary());
}

async function doEnrich(state: LibraryState, settings: Settings, force: boolean) {
  const src = settings.artSources ?? {};
  // 1. Steam: ask the store for each game's current art paths (newer games use hashed file names).
  const steamGames = state.games.filter((g) => g.source === 'steam' && /^\d+$/.test(g.sourceGameId));
  if (steamGames.length) {
    const items = src.steamStore === false ? new Map() : await steamItems(steamGames.map((g) => Number(g.sourceGameId))).catch(() => new Map());
    await store.setScannedArtMany([...items.values()].map((it) => ({ id: `steam:${it.appid}`, art: it.art, replace: true })));
    await store.setControllerMany([...items.values()].filter((it) => it.controller).map((it) => ({ id: `steam:${it.appid}`, controller: it.controller! })));
    // 2. Steam's own art cache on this PC: always the exact images the Steam client shows, works offline.
    const localArt = src.steamLocal === false ? new Map() : await steamLocalArt(settings.customPaths?.steam).catch(() => new Map());
    await store.setScannedArtMany(
      steamGames.filter((g) => localArt.has(g.sourceGameId)).map((g) => ({ id: g.id, art: localArt.get(g.sourceGameId)!, replace: true }))
    );
    broadcast(await store.getLibrary());
  }
  // 3. Other stores: borrow Steam's art when the same game is on Steam.
  const fresh = async () => (await store.getLibrary()).games;
  let missing = src.steamStore === false ? [] : (await fresh()).filter((g) => g.source !== 'steam' && !hasCover(g));
  const matched: { id: string; appid: number }[] = [];
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4);
    const ids = await Promise.all(batch.map((g) => steamMatch(g.overrides.title || g.title).catch(() => undefined)));
    batch.forEach((g, k) => ids[k] && matched.push({ id: g.id, appid: ids[k]! }));
  }
  if (matched.length) {
    const items = await steamItems(matched.map((m) => m.appid)).catch(() => new Map());
    await store.setScannedArtMany(matched.filter((m) => items.has(m.appid)).map((m) => ({ id: m.id, art: items.get(m.appid)!.art })));
    await store.setControllerMany(matched.filter((m) => items.get(m.appid)?.controller).map((m) => ({ id: m.id, controller: items.get(m.appid)!.controller! })));
    broadcast(await store.getLibrary());
  }
  // 4. Anything still without a cover: free scraper across Steam, Epic and GOG by exact title.
  missing = (await fresh()).filter((g) => !hasCover(g));
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4);
    const arts = await Promise.all(batch.map((g) => autoFreeArt(g.overrides.title || g.title, src, force).catch(() => undefined)));
    const ups = batch.map((g, k) => ({ id: g.id, art: arts[k]! })).filter((u) => u.art);
    if (ups.length) await store.setScannedArtMany(ups);
  }
  if (missing.length) broadcast(await store.getLibrary());
  for (const g of state.games) {
    if (g.source === 'gog' && !g.art.hero) {
      const a = await gogArt(g.sourceGameId).catch(() => ({} as any));
      if (a.hero || a.logo) await store.setScannedArt(g.id, a);
    }
  }
  // 5. SteamGridDB, if the user added a key.
  if (settings.steamGridDbKey && settings.autoFetchArt) {
    for (const g of (await fresh()).filter((x) => !hasCover(x))) {
      try {
        const a = await autoArt(settings.steamGridDbKey, g.overrides.title ?? g.title);
        if (a.cover || a.hero || a.logo) await store.setScannedArt(g.id, a);
      } catch {
        break; // bad key or rate limit; try again next scan
      }
    }
  }
  broadcast(await store.getLibrary());
  await enrichPads().catch(() => undefined);
}

let scanInFlight: Promise<LibraryState> | null = null;

/** One scan at a time: the window asks for one at startup and so does main, and a double
 *  scan only makes the launchers work twice. Both callers get the same result. */
function doScan(): Promise<LibraryState> {
  if (!scanInFlight) scanInFlight = runScan().finally(() => { scanInFlight = null; });
  return scanInFlight;
}

async function runScan(): Promise<LibraryState> {
  const settings = await store.getSettings();
  const { games, reports } = await scanAll(settings);
  const owned = await scanOwned(settings, games);
  // Signed-in accounts give the most complete list, so they go first and win duplicates.
  const acct = await accountGames();
  const ownedIds = new Set(acct.games.map((g) => g.id));
  const acctTitles = new Set(acct.games.map((g) => `${g.source}|${normTitle(g.title)}`));
  owned.games = [...acct.games, ...owned.games.filter((g) => !ownedIds.has(g.id) && !(g.id.startsWith('galaxy:') && acctTitles.has(`${g.source}|${normTitle(g.title)}`)))];
  for (const a of acct.reports) owned.reports.push({ source: a.source, owned: a.owned, error: a.error });
  for (const o of owned.reports) {
    const r = reports.find((x) => x.source === o.source);
    if (r) Object.assign(r, { owned: o.owned, ownedError: o.error });
  }
  // Account lists for EA, Ubisoft and Battle.net use different ids than the installed scan,
  // so drop the ones that are already installed (same launcher, same name).
  const installedTitles = new Set(games.map((g) => `${g.source}|${normTitle(g.title)}`));
  owned.games = owned.games.filter((g) => !(g.sourceGameId.startsWith('acct-') && installedTitles.has(`${g.source}|${normTitle(g.title)}`)));
  const state = await store.applyScan(games, owned.games, reports);
  enrichArt(state, settings).catch(() => undefined);
  return state;
}

function registerIpc() {
  ipcMain.handle('library:get', () => store.getLibrary());
  ipcMain.handle('downloads:get', async () => {
    pollDownloads(true).catch(() => undefined);
    return lastDownloads();
  });
  ipcMain.handle('pad:battery', (_e, refresh?: boolean) => padBatteries(refresh));
  ipcMain.handle('sys:temps', async (_e, refresh?: boolean) => ({ list: await temps(refresh), note: tempsNote() }));
  ipcMain.handle('downloads:clear', (_e, id: string) => clearDownload(id));
  ipcMain.handle('downloads:open', (_e, source: SourceId) => openDownloadsPage(source));
  ipcMain.handle('downloads:launcher', (_e, source: SourceId) => downloadsPageName(source));
  ipcMain.handle('app:bigscreen', (_e, on: boolean) => { bigScreenOn = on; if (!on) stopPadCursor(); });
  ipcMain.handle('library:scan', () => doScan());

  ipcMain.handle('game:achievements', (_e, id: string) => achievementsFor(id).catch(() => undefined));

  ipcMain.handle('game:uninstall', async (_e, id: string) => {
    const g = await store.findGame(id);
    if (!g) return { ok: false, error: 'Game not found' };
    if (!g.installed) return { ok: false, error: 'That game is not installed' };
    const settings = await store.getSettings();
    const r = await uninstallGame(g);
    // An uninstaller's window is as unreachable with a pad as an install box, so on a TV the
    // controller becomes the mouse for it too, until the game is gone or the player gives up.
    if (r.ok && r.started && bigScreenOn && settings.padCursor !== false) {
      padWatch = g.id;
      padUntil = Date.now() + 5 * 60 * 1000;
      padGone = g.id;
      padCursor(true).catch(() => undefined);
    }
    // The uninstaller takes a while and Lumen is not told when it finishes, so look again twice.
    if (r.ok) {
      pollDownloads(true).catch(() => undefined);
      for (const ms of [25000, 90000]) setTimeout(() => doScan().then(broadcast).catch(() => undefined), ms);
    }
    return r;
  });

  ipcMain.handle('game:launch', async (_e, id: string) => {
    const g = await store.findGame(id);
    if (!g) return { ok: false, error: 'Game not found' };
    const settings = await store.getSettings();
    // Not installed: hand off to the owning launcher's install page.
    if (!g.installed && g.source !== 'manual') {
      if (!g.install) return { ok: false, error: 'This game is not installed' };
      // The launcher is already holding this one: its queue is paused, something is ahead of it,
      // or it only downloads at set hours. Asking it to install again changes nothing, so go to
      // the list where it can be started, which is also the only place that button exists.
      const held = lastDownloads().find((d) => d.gameId === g.id && (d.state === 'queued' || d.state === 'paused'));
      if (held) {
        const r = await openDownloadsPage(g.source);
        if (!r.ok) return r;
        keepFocus();
        pollDownloads(true);
        return { ok: true, installing: true, openedDownloads: true };
      }
      const r = await openLauncherLink(g.install.target);
      if (!r.ok) return r;
      // The launcher does the downloading, but the player stays in Lumen: we take focus back
      // and follow the progress ourselves.
      noteInstallStarted(g.id, g.overrides.title || g.title, g.source);
      // Remembered so that the moment the launcher really starts downloading, its window goes
      // down and Lumen comes back up. Nothing is touched before then, because the install box
      // still needs an answer and it belongs to the launcher.
      comeBack.set(g.id, Date.now() + 10 * 60 * 1000);
      // The launcher's install box knows nothing about a controller, so on a TV the controller
      // becomes the mouse until that box is answered. It stops as soon as the download starts.
      if (bigScreenOn && settings.padCursor !== false) {
        padWatch = g.id;
        padUntil = Date.now() + 4 * 60 * 1000;
        padGone = null; // this one ends when bytes move, not when the game disappears
        padCursor(true).catch(() => undefined);
      } else {
        keepFocus(); // on the desktop, keep Lumen in front and let the launcher work behind it
      }
      pollDownloads(true);
      return { ok: true, installing: true };
    }
    const spec = g.overrides.launch ?? g.launch;
    const started = Date.now();
    try {
      if (spec.kind === 'url') {
        const r = await openLauncherLink(spec.target);
        if (!r.ok) return r;
      } else {
        const child = spawn(spec.target, spec.args ?? [], {
          cwd: spec.cwd || path.dirname(spec.target),
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        // Direct launches let us time the session. Launcher-owned games (URLs) only record the launch.
        if (spec.target.toLowerCase() !== 'explorer.exe') {
          child.on('exit', async () => {
            const mins = Math.round((Date.now() - started) / 60000);
            const cur = (await store.findGame(id))?.overrides.playMinutes ?? 0;
            await store.updateOverrides(id, { playMinutes: cur + mins });
            broadcast(await store.getLibrary());
            if (settings.minimizeOnLaunch) win?.restore();
          });
        }
        child.on('error', () => undefined);
        child.unref();
      }
      await store.updateOverrides(id, { lastPlayed: Date.now(), playCount: (g.overrides.playCount ?? 0) + 1 });
      broadcast(await store.getLibrary());
      if (settings.minimizeOnLaunch && !win?.isFullScreen()) win?.minimize();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle('game:update', async (_e, id: string, patch: GameOverrides) => {
    const g = await store.updateOverrides(id, patch);
    broadcast(await store.getLibrary());
    return g;
  });

  ipcMain.handle('game:addManual', async (_e, input: { title: string; exe: string; args?: string; cwd?: string }) => {
    const id = `manual:${randomUUID()}`;
    const g = await store.addManual({
      id,
      source: 'manual',
      sourceGameId: id.slice(7),
      title: input.title,
      installDir: input.cwd || path.dirname(input.exe),
      launch: { kind: 'exe', target: input.exe, args: input.args ? input.args.split(' ').filter(Boolean) : [], cwd: input.cwd },
      art: {}
    });
    const settings = await store.getSettings();
    if (settings.steamGridDbKey && settings.autoFetchArt) {
      autoArt(settings.steamGridDbKey, input.title)
        .then(async (a) => {
          await store.setScannedArt(id, a);
          broadcast(await store.getLibrary());
        })
        .catch(() => undefined);
    }
    broadcast(await store.getLibrary());
    return g;
  });

  ipcMain.handle('game:remove', async (_e, id: string) => {
    await store.removeGame(id);
    broadcast(await store.getLibrary());
  });

  ipcMain.handle('categories:set', async (_e, cats: string[]) => {
    await store.setCategories(cats);
    broadcast(await store.getLibrary());
  });

  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:save', async (_e, patch: Partial<Settings>) => {
    const s = await store.saveSettings(patch);
    if ('launchOnStartup' in patch || 'startInBigScreen' in patch) app.setLoginItemSettings({ openAtLogin: s.launchOnStartup, args: s.launchOnStartup && s.startInBigScreen ? [BIG_ARG] : [] });
    return s;
  });

  ipcMain.handle('dialog:pick', async (_e, kind: 'image' | 'exe' | 'audio' | 'video') => {
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters:
        kind === 'image'
          ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
          : kind === 'audio'
            ? [{ name: 'Music', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus'] }]
            : kind === 'video'
              ? [{ name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'mov'] }]
              : [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk', 'url'] }, { name: 'All files', extensions: ['*'] }]
    });
    return res.canceled ? undefined : res.filePaths[0];
  });

  ipcMain.handle('art:import', async (_e, file: string) => {
    await fs.mkdir(store.artDir(), { recursive: true });
    const dest = path.join(store.artDir(), `${randomUUID()}${path.extname(file).toLowerCase()}`);
    await fs.copyFile(file, dest);
    return `lumen-img://local/?p=${encodeURIComponent(dest)}`;
  });
  ipcMain.handle('art:free', async (_e, q: string) => freeArt(q, (await store.getSettings()).artSources));
  ipcMain.handle('art:fix', async () => {
    const before = (await store.getLibrary()).games.filter((g) => !hasCover(g)).length;
    if (enriching) await enriching;
    await enrichArt(await store.getLibrary(), await store.getSettings(), true);
    const after = (await store.getLibrary()).games.filter((g) => !hasCover(g)).length;
    return { missingBefore: before, missingAfter: after };
  });
  ipcMain.handle('lookup:search', (_e, q: string) => lookup(q));
  ipcMain.handle('lookup:details', (_e, id: number) => lookupDetails(id));
  ipcMain.handle('file:saveText', async (_e, name: string, content: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: name, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return false;
    await fs.writeFile(r.filePath, '\ufeff' + content, 'utf8');
    return true;
  });
  ipcMain.handle('art:search', async (_e, q: string) => searchArt((await store.getSettings()).steamGridDbKey, q));
  ipcMain.handle('art:list', async (_e, id: number, kind: 'cover' | 'hero' | 'logo') =>
    listArt((await store.getSettings()).steamGridDbKey, id, kind)
  );

  ipcMain.handle('power', (_e, action: PowerAction) => power(action));
  ipcMain.handle('game:info', async (_e, id: string, refresh?: boolean) => {
    const g = await store.findGame(id);
    if (!g) return null;
    try {
      return await gameInfo(g, refresh);
    } catch {
      return null;
    }
  });
  ipcMain.handle('accounts:list', () => accountsInfo());
  ipcMain.handle('launcher:icons', () => launcherIcons());
  ipcMain.handle('accounts:signIn', async (_e, id: AccountId) => {
    try {
      const accounts = await signIn(id, win);
      doScan().then(broadcast).catch(() => undefined);
      return { ok: true, accounts };
    } catch (e: any) {
      return { ok: false, accounts: await accountsInfo(), error: String(e?.message ?? e) };
    }
  });
  ipcMain.handle('accounts:signOut', (_e, id: AccountId) => signOut(id));
  ipcMain.handle('store:deals', (_e, refresh?: boolean) => deals(refresh));
  ipcMain.handle('store:pulse', (_e, kind: PulseKind, refresh?: boolean) => pulse(kind, refresh).catch(() => []));
  ipcMain.handle('shortcut:global', (_e, accel: string) => setGlobal(accel));
  ipcMain.handle('shell:openFolder', (_e, p: string) => shell.openPath(p));
  ipcMain.handle('window:fullscreen', (_e, on: boolean) => win?.setFullScreen(on));
  ipcMain.handle('weather', async (_e, force?: boolean) => { const st = await store.getSettings(); return weather(st.weatherCity ?? '', st.weatherUnit ?? 'c', !!force); });
  ipcMain.handle('sys:drives', (_e, refresh?: boolean) => drives(!!refresh).catch(() => []));
  ipcMain.handle('couch:status', () => couchStatus());
  ipcMain.handle('couch:setup', (_e, on: boolean) => couchSetup(!!on));
  ipcMain.handle('couch:open', (_e, what) => couchOpen(what));
  ipcMain.handle('app:quit', () => app.quit());
}

app.whenReady().then(async () => {
  // Serves local images (custom artwork, Xbox package logos) to the sandboxed renderer.
  protocol.handle('lumen-img', async (req) => {
    const p = new URL(req.url).searchParams.get('p') ?? '';
    if (!MEDIA_EXT.has(path.extname(p).toLowerCase())) return new Response('Not a media file', { status: 403 });
    // Pass Range headers through so videos and music can seek and loop.
    return net.fetch(pathToFileURL(p).toString(), { headers: req.headers });
  });
  registerIpc();
  registerLink();
  await createWindow();
  setGlobal((await store.getSettings()).globalBigScreenKey);
  // Tell the UI when the PC wakes so music and wallpapers can resume cleanly.
  powerMonitor.on('resume', () => win?.webContents.send('app:resume'));
  // Scan on startup so the library is fresh without a click. The window asks for one too,
  // which shows the spinner; whichever gets there first, only one scan runs.
  if ((await store.getSettings()).scanOnStart !== false) doScan().then(broadcast).catch(() => undefined);
  pollDownloads().catch(() => undefined);
});

function power(action: PowerAction): { ok: boolean; error?: string } {
  if (action === 'quit') {
    app.quit();
    return { ok: true };
  }
  if (process.platform !== 'win32') return { ok: false, error: 'Power options only work on Windows' };
  switch (action) {
    case 'shutdown':
      spawn('shutdown.exe', ['/s', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      break;
    case 'restart':
      spawn('shutdown.exe', ['/r', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      break;
    case 'sleep': {
      // Calls Windows' own sleep function. It waits a moment first so letting go of the button or
      // mouse doesn't wake the PC straight back up. PCs with "modern standby" refuse that call, so
      // there the display is switched off instead, which is how they go to sleep.
      const script = [
        "$sig = '[DllImport(\"powrprof.dll\", SetLastError=true)] public static extern bool SetSuspendState(bool hibernate, bool force, bool wakeupEventsDisabled); [DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);'",
        '$t = Add-Type -MemberDefinition $sig -Name LumenPower -Namespace LumenWin32 -PassThru',
        'Start-Sleep -Milliseconds 900',
        'if (-not $t::SetSuspendState($false, $false, $false)) { [void]$t::PostMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xF170, [IntPtr]2) }'
      ].join('; ');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'ignore', windowsHide: true });
      // No PowerShell (very rare): fall back to the classic one-liner.
      child.on('error', () => spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { detached: true, stdio: 'ignore' }).unref());
      child.unref();
      break;
    }
    case 'lock':
      spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref();
      break;
  }
  return { ok: true };
}

let currentGlobal = '';
function setGlobal(accel: string): boolean {
  if (currentGlobal) globalShortcut.unregister(currentGlobal);
  currentGlobal = '';
  if (!accel) return true;
  try {
    const ok = globalShortcut.register(accel, () => {
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send('app:toggleBigScreen');
    });
    if (ok) currentGlobal = accel;
    return ok;
  } catch {
    return false;
  }
}

app.on('will-quit', () => globalShortcut.unregisterAll());

// The in-app browser (SteamDB, store pages): keep pop-up links inside the same tab, and never let pages
// in it run with Lumen's own privileges.
// Same version the pages are told in the user agent, so the browser hints agree with it.
const WEB_BRANDS = '"Chromium";v="150", "Google Chrome";v="150", "Not?A_Brand";v="99"';
app.whenReady().then(() => {
  session.fromPartition('persist:web').webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders;
    for (const k of Object.keys(h)) {
      const l = k.toLowerCase();
      if (l === 'sec-ch-ua') h[k] = WEB_BRANDS;
      else if (l === 'sec-ch-ua-full-version-list') h[k] = WEB_BRANDS.replace(/v="150"/g, 'v="150.0.0.0"');
    }
    cb({ requestHeaders: h });
  });
});
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, prefs) => {
    delete (prefs as any).preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
  });
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) contents.loadURL(url);
    else shell.openExternal(url);
    return { action: 'deny' };
  });
});
app.on('window-all-closed', () => app.quit());
