// Removing a game from the PC.
//
// Lumen never deletes anything itself. It starts the same uninstaller Windows would: Steam's own
// uninstall box for a Steam game, and the entry in "Apps & features" for everything else, which is
// what each launcher registers when it installs a game. If neither is there, the Apps & features
// list is opened so the player can finish it by hand.
import { shell } from 'electron';
import { spawn } from 'node:child_process';
import type { Game } from '../shared/types';
import { uninstallEntries } from './util';
import { openLauncherLink } from './handoff';

const tidy = (s: string) => s.replace(/[^a-z0-9]+/gi, '').toLowerCase();
const samePath = (a?: string, b?: string) => !!a && !!b && a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

/** The "Apps & features" entry for a game: the install folder is the trustworthy match, the name is the fallback. */
function entryFor(game: Game, keys: Awaited<ReturnType<typeof uninstallEntries>>) {
  const title = tidy(game.overrides.title || game.title);
  const dir = game.installDir;
  const usable = keys.filter((k) => k.values.UninstallString || k.values.QuietUninstallString);
  return (
    usable.find((k) => samePath(k.values.InstallLocation, dir)) ??
    (title ? usable.find((k) => tidy(k.values.DisplayName ?? '') === title) : undefined)
  );
}

export interface UninstallResult { ok: boolean; started?: boolean; opened?: boolean; error?: string; missingLauncher?: string }

export async function uninstallGame(game: Game): Promise<UninstallResult> {
  // Steam keeps its own uninstall box, which also tidies up its library entry.
  if (game.source === 'steam' && /^\d+$/.test(game.sourceGameId)) {
    const r = await openLauncherLink(`steam://uninstall/${game.sourceGameId}`);
    return r.ok ? { ok: true, started: true } : { ok: false, missingLauncher: r.missingLauncher, error: r.error };
  }
  if (process.platform !== 'win32') return { ok: false, error: 'Uninstalling only works on Windows' };

  const entry = entryFor(game, await uninstallEntries());
  const cmd = entry?.values.QuietUninstallString ?? entry?.values.UninstallString;
  if (cmd) {
    try {
      // Handed to the shell as one line, because these strings carry their own quoting and flags.
      spawn('cmd', ['/c', 'start', '', '/b', cmd], { detached: false, stdio: 'ignore', windowsHide: true });
      return { ok: true, started: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }
  // Nothing registered an uninstaller we can see, so hand the player the Windows list.
  await shell.openExternal('ms-settings:appsfeatures');
  return { ok: true, opened: true };
}
