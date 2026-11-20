// Launcher icons, read from the launchers installed on this PC (Windows' own file icons),
// so Lumen doesn't ship anyone's logo.
import { app, net } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SourceId } from '../shared/types';
import { env, exists, join, regValue, run } from './util';

let cache: Partial<Record<SourceId, string>> | undefined;

// Launchers that aren't installed here have no exe to read an icon from. For those, fetch the
// site icon of the launcher's own website once and keep it, so every launcher in the list has one.
const SITES: Partial<Record<SourceId, string>> = {
  steam: 'store.steampowered.com', epic: 'store.epicgames.com', gog: 'gog.com', ea: 'ea.com',
  ubisoft: 'ubisoft.com', xbox: 'xbox.com', battlenet: 'battle.net', amazon: 'gaming.amazon.com'
};
const savedFile = () => path.join(app.getPath('userData'), 'launcher-icons.json');

async function fetchIcon(domain: string): Promise<string | undefined> {
  for (const url of [`https://www.google.com/s2/favicons?sz=128&domain=${domain}`, `https://icons.duckduckgo.com/ip3/${domain}.ico`]) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 7000);
      const r = await net.fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const type = r.headers.get('content-type') ?? 'image/png';
      const buf = Buffer.from(await r.arrayBuffer());
      // Skip empty answers and the tiny grey globe placeholder.
      if (!/^image\//.test(type) || buf.length < 400) continue;
      return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch { /* try the next source */ }
  }
  return undefined;
}

async function onlineIcons(missing: SourceId[]): Promise<Partial<Record<SourceId, string>>> {
  let saved: Partial<Record<SourceId, string>> = {};
  try { saved = JSON.parse(await fs.readFile(savedFile(), 'utf8')); } catch { /* first run */ }
  const need = missing.filter((id) => !saved[id] && SITES[id]);
  if (need.length) {
    const got = await Promise.all(need.map((id) => fetchIcon(SITES[id]!)));
    need.forEach((id, i) => { if (got[i]) saved[id] = got[i]; });
    if (got.some(Boolean)) await fs.writeFile(savedFile(), JSON.stringify(saved)).catch(() => undefined);
  }
  return Object.fromEntries(missing.filter((id) => saved[id]).map((id) => [id, saved[id]!]));
}

async function candidates(): Promise<Partial<Record<SourceId, string[]>>> {
  const pf = env('ProgramFiles', 'C:\\Program Files');
  const pf86 = env('ProgramFiles(x86)', 'C:\\Program Files (x86)');
  const local = env('LOCALAPPDATA', '');
  const steam = (await regValue('HKCU\\Software\\Valve\\Steam', 'SteamExe'))?.replace(/\//g, '\\');
  const ubi = await regValue('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher', 'InstallDir');
  const gog = await regValue('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths', 'client');
  return {
    steam: [steam ?? '', join(pf86, 'Steam', 'steam.exe')],
    epic: [join(pf86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'), join(pf, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe')],
    gog: [gog ? join(gog, 'GalaxyClient.exe') : '', join(pf86, 'GOG Galaxy', 'GalaxyClient.exe')],
    ea: [join(pf, 'Electronic Arts', 'EA Desktop', 'EA Desktop', 'EADesktop.exe'), join(pf86, 'Origin', 'Origin.exe')],
    ubisoft: [ubi ? join(ubi.replace(/\//g, '\\'), 'UbisoftConnect.exe') : '', join(pf86, 'Ubisoft', 'Ubisoft Game Launcher', 'UbisoftConnect.exe'), join(pf86, 'Ubisoft', 'Ubisoft Game Launcher', 'upc.exe')],
    battlenet: [join(pf86, 'Battle.net', 'Battle.net Launcher.exe'), join(pf86, 'Battle.net', 'Battle.net.exe')],
    amazon: [join(local, 'Amazon Games', 'App', 'Amazon Games.exe')]
  };
}

export async function launcherIcons(): Promise<Partial<Record<SourceId, string>>> {
  if (cache) return cache;
  const out: Partial<Record<SourceId, string>> = {};
  for (const [id, list] of process.platform === 'win32' ? Object.entries(await candidates()) : []) {
    for (const p of list ?? []) {
      if (!p || !(await exists(p))) continue;
      try {
        const img = await app.getFileIcon(p, { size: 'large' });
        if (!img.isEmpty()) {
          out[id as SourceId] = img.toDataURL();
          break;
        }
      } catch {}
    }
  }
  // The Xbox app is a Store package; its icon is a PNG inside the package folder.
  try {
    const ps = "$p = Get-AppxPackage Microsoft.GamingApp; if ($p) { $m = Get-AppxPackageManifest $p; $l = $m.Package.Properties.Logo; $f = Join-Path $p.InstallLocation $l; $alt = Get-ChildItem (Split-Path $f) -Filter ((Split-Path $f -LeafBase) + '*.png') | Sort-Object Length -Descending | Select-Object -First 1; if ($alt) { $alt.FullName } }";
    const file = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 15000)).trim();
    if (file) out.xbox = `lumen-img://local/?p=${encodeURIComponent(file)}`;
  } catch {}
  const missing = (Object.keys(SITES) as SourceId[]).filter((id) => !out[id]);
  const online = await onlineIcons(missing);
  Object.assign(out, online);
  // If some are still missing (offline), don't remember that: try again next time icons are asked for.
  if (missing.every((id) => online[id])) cache = out;
  return out;
}
