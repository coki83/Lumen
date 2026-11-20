import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Download, Game, GameOverrides, LibraryState, Settings } from '../../shared/types';
import { api } from './api';
import { t } from './i18n';
import { stopMusic } from './sound';

interface Ctx {
  ready: boolean;
  /** What the launchers are downloading or installing right now. */
  downloads: Download[];
  library: LibraryState;
  settings: Settings;
  scanning: boolean;
  toast: string;
  icons: Partial<Record<string, string>>;
  notify(msg: string): void;
  scan(): Promise<void>;
  launch(g: Game): Promise<void>;
  /** Starts the game's own uninstaller. The caller asks the player first. */
  uninstall(g: Game): Promise<void>;
  update(id: string, patch: GameOverrides): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  setCategories(c: string[]): Promise<void>;
}

const LAUNCHER_WORDS: Record<string, string> = { steam: 'Steam', epic: 'Epic', gog: 'GOG Galaxy', ea: 'The EA app', ubisoft: 'Ubisoft Connect', xbox: 'The Xbox app', battlenet: 'Battle.net', amazon: 'Amazon Games' };
const SOURCE_WORD = (s: string) => LAUNCHER_WORDS[s] ?? 'The launcher';

const C = createContext<Ctx>(null as any);
export const useLumen = () => useContext(C);

export function LumenProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<LibraryState>({ games: [], categories: [], reports: [] });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState('');
  const [icons, setIcons] = useState<Partial<Record<string, string>>>({});
  const [downloads, setDownloads] = useState<Download[]>([]);
  // Scan every launcher once when Lumen opens, so a game installed outside Lumen is already
  // there. It runs after the saved library is on screen, so nothing is blocked waiting for it.
  const started = useRef(false);

  useEffect(() => {
    Promise.all([api.getLibrary(), api.getSettings()]).then(([l, s]) => {
      setLibrary(l);
      setSettings(s);
      if (s.scanOnStart !== false && !started.current) {
        started.current = true;
        setScanning(true);
        api.scan().then(setLibrary).catch(() => undefined).finally(() => setScanning(false));
      }
    });
    api.launcherIcons().then(setIcons).catch(() => undefined);
    api.downloads?.().then(takeDownloads).catch(() => undefined);
    const offDl = api.onDownloads?.(takeDownloads);
    const offLib = api.onLibraryChanged(setLibrary);
    return () => { offDl?.(); offLib(); };
  }, []);

  // One row per game, whatever the launchers report. Two rows sharing a game id would share a
  // React key, and React then leaves the extra copies on screen for good.
  const takeDownloads = useCallback((list: Download[]) => {
    const once = new Map<string, Download>();
    for (const d of list) {
      const prev = once.get(d.gameId);
      if (!prev || (d.bytes || 0) > (prev.bytes || 0) || (d.total || 0) > (prev.total || 0)) once.set(d.gameId, d);
    }
    setDownloads([...once.values()]);
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as any)._t);
    (notify as any)._t = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!settings) return null;
    return {
      ready: true,
      downloads,
      library,
      settings,
      scanning,
      toast,
      icons,
      notify,
      scan: async () => {
        setScanning(true);
        try {
          const l = await api.scan();
          setLibrary(l);
          const errs = l.reports.filter((r) => r.error);
          notify(errs.length ? `Scan finished with ${errs.length} problem(s)` : `Found ${l.games.filter((g) => g.installed).length} installed and ${l.games.filter((g) => !g.installed && g.owned).length} more you own`);
        } finally {
          setScanning(false);
        }
      },
      launch: async (g) => {
        const r = await api.launch(g.id);
        // The game is taking over the screen: hush Lumen's own music right away, don't wait
        // for the game's window to steal the focus.
        if (r.ok && !r.installing) stopMusic(true);
        const name = g.overrides.title || g.title;
        notify(
          r.missingLauncher
            ? t("{launcher} isn't installed. Opening its download page: install it, sign in, then press Install again.", { launcher: r.missingLauncher })
            : !r.ok
              ? t("Couldn't launch: {error}", { error: r.error ?? '' })
              : r.openedDownloads
                ? t('{launcher} is holding this download. Its downloads list is open: press Resume there and Lumen follows along.', { launcher: SOURCE_WORD(g.source) })
                : r.installing
                  ? t('Installing {name}. If {launcher} asks something, move the mouse with the stick and press A, then Lumen comes back on its own.', { name, launcher: SOURCE_WORD(g.source) })
                  : t('Launching {name}…', { name })
        );
      },
      uninstall: async (g) => {
        const name = g.overrides.title || g.title;
        const r = await api.uninstall?.(g.id);
        if (!r) return notify('Uninstalling needs the desktop app');
        notify(
          r.missingLauncher ? `${r.missingLauncher} isn't installed, so it can't remove ${name}.`
            : !r.ok ? `Couldn't start the uninstaller: ${r.error}`
            : r.opened ? `${name} has no uninstaller Lumen can see. Windows has opened its own list of apps for you.`
            : `Removing ${name}. ${SOURCE_WORD(g.source)} takes it from here: if it asks something, move the mouse with the stick and press A. Lumen updates the library when it is done.`
        );
      },
      update: async (id, patch) => {
        await api.updateGame(id, patch);
        setLibrary(await api.getLibrary());
      },
      saveSettings: async (patch) => {
        setSettings((s) => (s ? { ...s, ...patch } : s));
        setSettings(await api.saveSettings(patch));
      },
      setCategories: async (c) => {
        await api.setCategories(c);
        setLibrary(await api.getLibrary());
      }
    };
  }, [library, settings, scanning, toast, icons, downloads, notify]);

  if (!value) return <div className="boot" />;
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** The download for one game, if the launcher is working on it right now. */
export function useDownloadFor(id?: string) {
  const { downloads } = useLumen();
  return id ? downloads.find((d) => d.gameId === id) : undefined;
}

export function fmtBytes(n: number): string {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 1 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

export function fmtEta(s?: number): string {
  if (!s || !Number.isFinite(s)) return '';
  if (s < 90) return t('{n} s left', { n: Math.round(s) });
  if (s < 5400) return t('{n} min left', { n: Math.round(s / 60) });
  return t('{n} h left', { n: (s / 3600).toFixed(1) });
}

export function downloadLabel(d: { state: string; bytes: number; total: number; bytesPerSecond?: number; eta?: number }): string {
  // "0 of 19 GB" is noise, so the byte part only shows once some of it is really on disk.
  const some = d.bytes > 0 && d.total > 0 ? t('{done} of {all}', { done: fmtBytes(d.bytes), all: fmtBytes(d.total) }) : '';
  if (d.state === 'starting') return t('Asking the launcher…');
  if (d.state === 'paused') return some ? `${t('Paused in the launcher')} · ${some}` : t('Paused in the launcher');
  if (d.state === 'queued') return some ? `${t('Waiting its turn in the launcher')} · ${some}` : t('Waiting its turn in the launcher');
  if (d.state === 'installing') return some ? `${t('Installing')} · ${some}` : t('Installing');
  const parts = [some, d.bytesPerSecond ? `${fmtBytes(d.bytesPerSecond)}/s` : '', fmtEta(d.eta)].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('Downloading');
}

/** The few characters that fit on a tile or in the Big Screen header. */
export function downloadShort(d: { state: string; percent?: number }): string {
  if (d.state === 'paused') return t('Paused');
  if (d.state === 'queued') return t('Queued');
  if (d.state === 'starting') return t('Starting');
  if (d.percent !== undefined) return `${d.percent}%`;
  return d.state === 'downloading' ? t('Downloading') : t('Installing');
}

/** True while the launcher is holding the install instead of working on it. */
export function downloadWaiting(state: string): boolean {
  return state === 'queued' || state === 'paused';
}
