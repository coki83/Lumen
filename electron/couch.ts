// Couch mode: everything a TV / couch gaming PC needs, set up with one click.
//
// Windows 11's Xbox mode (Full Screen Experience, FSE) only lets packaged Store-style apps be the
// "home app". Lumen is a normal desktop app, so it cannot register itself there. A bridge app that
// is packaged can take the slot and start Lumen: Xbox mode starts the bridge, the bridge starts
// Lumen with --bigscreen (or the lumen://bigscreen link).
//
// Two bridges are offered. AnyFSE is the one to use, because it takes a custom executable, so Lumen
// goes in as itself; OmniConsole stays for anyone already using it. Both are installed and
// configured by the user: between them they want administrator rights, a certificate in Trusted
// People and Windows' developer mode, and none of that belongs to a games launcher. Lumen finds
// them, links them, and hands over the exact path and argument to paste.
import { app, clipboard, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { CouchStatus } from '../shared/types';
import { listDir, regValue, run, uninstallEntries } from './util';
import * as store from './store';

export const BIG_ARG = '--bigscreen';
export const BIG_LINK = 'lumen://bigscreen';
const XFSET_PAGE = 'https://github.com/8bit2qubit/XboxFullScreenExperienceTool/releases/latest';
// Latest rather than the v0.90.21 tag, so the link does not go stale as the project moves.
const ANYFSE_PAGE = 'https://github.com/ashpynov/AnyFSE/releases/latest';
const OMNI_PAGE = 'https://8bit2qubit.github.io/omniconsole-site/download/';

/** True when a command line asks for Big Screen (argument or lumen:// link). */
export function wantsBig(argv: string[]): boolean {
  return argv.some((a) => a === BIG_ARG || /^lumen:\/\/bigscreen/i.test(a));
}

function shortcutPath() {
  return path.join(app.getPath('desktop'), 'Lumen Big Screen.lnk');
}

async function omniInstalled(): Promise<boolean | null> {
  if (process.platform !== 'win32') return null;
  const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-AppxPackage *OmniConsole* | Select-Object -First 1).Name']);
  return /omniconsole/i.test(out);
}

/**
 * AnyFSE (MIT, github.com/ashpynov/AnyFSE) registers itself as a Full Screen Experience home app
 * and starts whatever launcher it is pointed at, including a custom executable, which is how Lumen
 * gets in. Its installer wants administrator rights and touches Windows' developer mode and the
 * certificate store, so Lumen never runs it: it only says whether it is there.
 */
async function anyFse(): Promise<{ installed: boolean; dir?: string }> {
  if (process.platform !== 'win32') return { installed: false };
  const entry = (await uninstallEntries()).find((k) => /^any\s*fse$/i.test((k.values.DisplayName ?? '').trim()));
  const dir = (entry?.values.InstallLocation ?? '').replace(/"/g, '').trim();
  if (dir && (await listDir(dir)).length) return { installed: true, dir };
  if (entry) return { installed: true };
  // Its own uninstall instructions name this folder, so it is worth a second look.
  const guess = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'AnyFSE');
  if ((await listDir(guess)).length) return { installed: true, dir: guess };
  return { installed: false };
}

/**
 * Xbox Full Screen Experience Tool: unlocks the full (handheld) Xbox mode on desktops and laptops, which is what
 * adds "Choose home app". It changes Windows deeply and needs admin rights and a restart, so Lumen only finds,
 * links and opens it; the user presses its Enable button themselves.
 */
async function xfset(): Promise<{ installed: boolean; exe?: string }> {
  if (process.platform !== 'win32') return { installed: false };
  const entry = (await uninstallEntries()).find((k) => /xbox\s*full\s*screen\s*experience\s*tool/i.test(k.values.DisplayName ?? ''));
  if (!entry) return { installed: false };
  const dir = (entry.values.InstallLocation ?? '').replace(/"/g, '').trim();
  if (dir) {
    const exe = (await listDir(dir)).find((f) => /^xboxfullscreenexperiencetool.*\.exe$/i.test(f));
    if (exe) return { installed: true, exe: path.join(dir, exe) };
  }
  return { installed: true };
}

/** Needs 26100.7019+, 26200.7015+ or any newer build. */
async function fseBuild(): Promise<{ build: number; ubr: number; ok: boolean }> {
  if (process.platform !== 'win32') return { build: 0, ubr: 0, ok: false };
  const build = Number(os.release().split('.')[2]) || 0;
  const ubr = Number(await regValue('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', 'UBR')) || 0;
  const ok = build > 26200 || (build === 26200 && ubr >= 7015) || (build >= 26100 && build < 26200 && ubr >= 7019);
  return { build, ubr, ok };
}

export function registerLink() {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  return app.setAsDefaultProtocolClient('lumen');
}

function applyLogin(on: boolean, big: boolean) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: on, args: on && big ? [BIG_ARG] : [] });
}

export async function couchStatus(): Promise<CouchStatus> {
  const s = await store.getSettings();
  const [b, x, a] = await Promise.all([fseBuild(), xfset(), anyFse()]);
  return {
    enabled: !!s.couchMode,
    exe: process.execPath,
    arg: BIG_ARG,
    link: BIG_LINK,
    linkRegistered: process.platform === 'win32' ? app.isDefaultProtocolClient('lumen') : false,
    omniConsole: await omniInstalled(),
    anyFse: process.platform === 'win32' ? a.installed : null,
    anyFseCanOpen: !!a.dir,
    windowsBuild: b.build,
    windowsRevision: b.ubr,
    fseCapable: b.ok,
    fseTool: x.installed,
    fseToolCanOpen: !!x.exe
  };
}

/** One click: start with Windows, straight into full screen Big Screen, plus a link and shortcut other tools can start. */
export async function couchSetup(on: boolean): Promise<CouchStatus> {
  await store.saveSettings({ couchMode: on, startInBigScreen: on, launchOnStartup: on });
  applyLogin(on, on);
  if (on) {
    registerLink();
    if (process.platform === 'win32') {
      try {
        shell.writeShortcutLink(shortcutPath(), 'create', { target: process.execPath, args: BIG_ARG, description: 'Lumen in Big Screen', icon: process.execPath, iconIndex: 0 });
      } catch { /* a missing desktop folder is not worth failing the setup */ }
    }
  } else if (process.platform === 'win32') {
    await shell.trashItem(shortcutPath()).catch(() => undefined);
  }
  return couchStatus();
}

export async function couchOpen(what: 'anyfse' | 'openAnyFse' | 'omniconsole' | 'fseTool' | 'openFseTool' | 'gaming' | 'copyPath' | 'copyArg' | 'copyLink'): Promise<void> {
  if (what === 'anyfse') await shell.openExternal(ANYFSE_PAGE);
  else if (what === 'openAnyFse') { const a = await anyFse(); if (a.dir) await shell.openPath(a.dir); }
  else if (what === 'omniconsole') await shell.openExternal(OMNI_PAGE);
  else if (what === 'fseTool') await shell.openExternal(XFSET_PAGE);
  else if (what === 'openFseTool') { const x = await xfset(); if (x.exe) await shell.openPath(x.exe); }
  else if (what === 'gaming') await shell.openExternal('ms-settings:gaming-gamebar');
  else if (what === 'copyPath') clipboard.writeText(process.execPath);
  else if (what === 'copyArg') clipboard.writeText(BIG_ARG);
  else clipboard.writeText(BIG_LINK);
}
