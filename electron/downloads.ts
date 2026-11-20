// Download progress for installs the launchers are doing. Steam writes its progress into the
// appmanifest files it keeps next to the games, so Lumen can read it and show its own progress bar.
// The other launchers keep nothing readable, so those show as "Installing" until the scan finds them.
import type { Download, SourceId } from '../shared/types';
import { ci, exists, join, listDir, parseVdf, programData, readText } from './util';
import { steamLibraries } from './scanners/steam';

/** Games the user started installing from Lumen, until the launcher reports them. */
const started = new Map<string, { title: string; source: SourceId; at: number; gameId: string }>();
const speeds = new Map<string, { bytes: number; at: number; rate: number }>();
let last: Download[] = [];

export function noteInstallStarted(gameId: string, title: string, source: SourceId) {
  started.set(gameId, { title, source, at: Date.now(), gameId });
}

export function clearDownload(gameId: string) {
  started.delete(gameId);
  speeds.delete(gameId);
  last = last.filter((d) => d.gameId !== gameId);
}

// StateFlags bits Steam writes into an appmanifest. 512 is UpdatePaused; the rest are the bits it
// sets only while a job is actually working (running, downloading, staging, preallocating,
// adding files, committing). Anything else with half a download on disk is waiting its turn.
const PAUSED = 512;
const RUNNING = 256 | 1024 | 262144 | 524288 | 1048576 | 2097152 | 4194304;

/** What Steam is doing with a job, read from its StateFlags and its byte counters. */
export function steamState(flags: number, moving: boolean, installing: boolean): Download['state'] {
  if (flags & PAUSED) return 'paused';
  if (!(flags & RUNNING)) return 'queued';
  return moving ? 'downloading' : installing ? 'installing' : 'installing';
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Speed in bytes per second, smoothed so the number doesn't jump around. */
function rateOf(key: string, bytes: number): number {
  const now = Date.now();
  const prev = speeds.get(key);
  if (!prev) {
    speeds.set(key, { bytes, at: now, rate: 0 });
    return 0;
  }
  const dt = (now - prev.at) / 1000;
  if (dt < 0.8) return prev.rate;
  const raw = Math.max(0, (bytes - prev.bytes) / dt);
  const rate = prev.rate ? prev.rate * 0.6 + raw * 0.4 : raw;
  speeds.set(key, { bytes, at: now, rate });
  return rate;
}

async function steamDownloads(customPath?: string): Promise<Download[]> {
  // A game downloads into one library, but Steam leaves older appmanifest files behind in the
  // others, so the same appid can turn up several times. They are gathered by appid first and the
  // liveliest one wins, because two rows for one game would fight over the same key on screen and
  // over the same speed reading.
  const best = new Map<string, { st: any; bytes: number; total: number; moving: boolean; installing: boolean; flags: number; downloaded: number }>();
  for (const lib of await steamLibraries(customPath)) {
    for (const file of await listDir(lib)) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
      const text = await readText(join(lib, file));
      if (!text) continue;
      let st: any;
      try {
        st = ci(parseVdf(text), 'AppState');
      } catch {
        continue;
      }
      const appid = String(ci(st, 'appid') ?? '');
      if (!appid) continue;
      const flags = num(ci(st, 'StateFlags'));
      const downloaded = num(ci(st, 'BytesDownloaded'));
      const toDownload = num(ci(st, 'BytesToDownload'));
      const staged = num(ci(st, 'BytesStaged'));
      const toStage = num(ci(st, 'BytesToStage'));
      const busy = (flags & ~4) !== 0; // 4 on its own means fully installed and idle
      const moving = toDownload > 0 && downloaded < toDownload;
      const installing = toStage > 0 && staged < toStage;
      if (!busy && !moving && !installing) continue;
      // Steam says what it is doing in StateFlags. UpdatePaused is set while the job sits in a
      // paused queue, and the RUNNING bits are only set while it is really working. Without this
      // split anything with a partial download read as "queued", including a paused one.
      const row = { st, bytes: moving ? downloaded : staged, total: moving ? toDownload : toStage, moving, installing, flags, downloaded };
      const prev = best.get(appid);
      // The real download is the one actually moving bytes, and failing that the bigger job.
      if (!prev || (row.moving && !prev.moving) || (row.moving === prev.moving && row.total > prev.total)) best.set(appid, row);
    }
  }
  const out: Download[] = [];
  for (const [appid, r] of best) {
    const gameId = `steam:${appid}`;
    const rate = r.moving ? rateOf(gameId, r.downloaded) : 0;
    out.push({
      gameId,
      title: String(ci(r.st, 'name') ?? 'Steam game'),
      source: 'steam',
      state: steamState(r.flags, r.moving, r.installing),
      bytes: r.bytes,
      total: r.total,
      percent: r.total > 0 ? Math.min(100, Math.round((r.bytes / r.total) * 100)) : undefined,
      bytesPerSecond: rate || undefined,
      eta: rate > 0 && r.total > r.bytes ? Math.round((r.total - r.bytes) / rate) : undefined
    });
  }
  return out;
}

/** Epic writes a manifest for a game it is still installing; it has no byte counter we can trust. */
async function epicDownloads(): Promise<Download[]> {
  const dir = join(programData(), 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  if (!(await exists(dir))) return [];
  const out: Download[] = [];
  for (const file of await listDir(dir)) {
    if (!file.toLowerCase().endsWith('.item')) continue;
    const text = await readText(join(dir, file));
    if (!text) continue;
    try {
      const m = JSON.parse(text);
      if (!m.bIsIncompleteInstall) continue;
      out.push({
        gameId: `epic:${m.AppName ?? m.CatalogItemId ?? file}`,
        title: m.DisplayName ?? 'Epic game',
        source: 'epic',
        state: 'downloading',
        bytes: 0,
        total: Number(m.InstallSize) || 0,
        percent: undefined
      });
    } catch {
      /* half-written file: try again next time */
    }
  }
  return out;
}

/** Everything that is downloading or installing right now, launchers first, then what Lumen kicked off. */
export async function downloads(customSteamPath?: string, installedIds: string[] = []): Promise<Download[]> {
  const [steam, epic] = await Promise.all([steamDownloads(customSteamPath).catch(() => []), epicDownloads().catch(() => [])]);
  const live = [...steam, ...epic];
  const seen = new Set(live.map((d) => d.gameId));
  const done = new Set(installedIds);
  for (const [id, s] of started) {
    if (seen.has(id) || done.has(id)) {
      started.delete(id);
      continue;
    }
    // Launchers that tell us nothing: show the game as starting for a while, then let it go.
    if (Date.now() - s.at > 60 * 60 * 1000) {
      started.delete(id);
      continue;
    }
    live.push({ gameId: id, title: s.title, source: s.source, state: 'starting', bytes: 0, total: 0 });
  }
  live.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  // Last guard: whatever happened upstream, one row per game. The list is a React key, and two
  // rows with the same key leave ghost copies on screen that never go away.
  const once = new Map<string, Download>();
  for (const d of live) {
    const prev = once.get(d.gameId);
    if (!prev || (d.bytes || 0) > (prev.bytes || 0) || (d.total || 0) > (prev.total || 0)) once.set(d.gameId, d);
  }
  const listed = [...once.values()];
  last = listed;
  return listed;
}

export function lastDownloads(): Download[] {
  return last;
}
