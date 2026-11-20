// Couch mode: everything a TV / couch gaming PC needs, set up with one click.
//
// Windows 11's Xbox mode (Full Screen Experience, FSE) only lets packaged Store-style apps be the
// "home app". Lumen is a normal desktop app, so it cannot register itself there. OmniConsole is a
// free home app that starts any launcher you point it at, so the bridge is: Xbox mode starts
// OmniConsole, OmniConsole starts Lumen with --bigscreen (or the lumen://bigscreen link).
import { app, clipboard, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { CouchStatus } from '../shared/types';
import { listDir, regValue, run, uninstallEntries } from './util';
import * as store from './store';

export const BIG_ARG = '--bigscreen';
export const BIG_LINK = 'lumen://bigscreen';
const XFSET_PAGE = 'https://github.com/8bit2qubit/XboxFullScreenExperienceTool/releases/latest';
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
  const [b, x] = await Promise.all([fseBuild(), xfset()]);
  return {
    enabled: !!s.couchMode,
    exe: process.execPath,
    arg: BIG_ARG,
    link: BIG_LINK,
    linkRegistered: process.platform === 'win32' ? app.isDefaultProtocolClient('lumen') : false,
    omniConsole: await omniInstalled(),
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

export async function couchOpen(what: 'omniconsole' | 'fseTool' | 'openFseTool' | 'gaming' | 'copyPath' | 'copyArg' | 'copyLink'): Promise<void> {
  if (what === 'omniconsole') await shell.openExternal(OMNI_PAGE);
  else if (what === 'fseTool') await shell.openExternal(XFSET_PAGE);
  else if (what === 'openFseTool') { const x = await xfset(); if (x.exe) await shell.openPath(x.exe); }
  else if (what === 'gaming') await shell.openExternal('ms-settings:gaming-gamebar');
  else if (what === 'copyPath') clipboard.writeText(process.execPath);
  else if (what === 'copyArg') clipboard.writeText(BIG_ARG);
  else clipboard.writeText(BIG_LINK);
}
