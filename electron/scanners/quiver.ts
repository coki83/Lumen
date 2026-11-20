import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScannedGame } from '../../shared/types';

/**
 * Quiver Launcher (quiverlauncher.com) installs the games and apps people publish on GitHub, GitLab and
 * other forges: source ports, recompilations and fan projects, many of them console games brought to the PC.
 * It is a Tauri app, so its own state sits in %APPDATA%\com.quiverlauncher.app as plain JSON files.
 * Lumen only reads those files; it never writes them, and it never bundles anything of Quiver's.
 */
const DATA_DIRS = (custom?: string) => {
  const roaming = process.env.APPDATA ?? '';
  const local = process.env.LOCALAPPDATA ?? '';
  const home = process.env.USERPROFILE ?? '';
  const names = ['com.quiverlauncher.app', 'Quiver Launcher', 'QuiverLauncher', 'quiver-launcher'];
  const roots = [roaming, local, home ? path.join(home, '.local', 'share') : ''].filter(Boolean);
  return [
    ...(custom ? [custom.trim()] : []),
    ...roots.flatMap((root) => names.map((n) => path.join(root, n)))
  ].filter(Boolean);
};

/** Quiver Launcher 3 kept a plain apps.json instead, in its own folder or beside a portable copy. */
const V3_DIRS = () => {
  const home = process.env.USERPROFILE ?? '';
  const local = process.env.LOCALAPPDATA ?? '';
  const roaming = process.env.APPDATA ?? '';
  const near = home ? ['', 'Downloads', 'Desktop', 'Games', 'Documents', 'Apps'].map((d) => path.join(home, d)) : [];
  return [
    ...(local ? [path.join(local, 'QuiverLauncher')] : []),
    ...(roaming ? [path.join(roaming, 'QuiverLauncher')] : []),
    ...near
  ];
};

interface QuiverArt { capsule?: string; header?: string; hero?: string; logo?: string }
interface QuiverItem {
  id: string;
  slug?: string;
  removed?: boolean;
  local?: { kind: 'program'; path: string; name: string } | { kind: 'folder'; folder: string; name: string };
  art?: { artwork?: string; libraryArt?: QuiverArt; consoles?: string[] };
  overrides?: { name?: string; cover?: string };
}
interface QuiverInstall {
  dir?: string;
  version?: string;
  program?: string;
  launch?: { executable?: string };
}
interface QuiverEntry { name?: string; artwork?: string; libraryArt?: QuiverArt; consoles?: string[] }

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

/** The first folder that holds a library file; Quiver keeps all of its state together. */
async function dataDir(custom?: string): Promise<string | undefined> {
  for (const dir of DATA_DIRS(custom)) {
    if (await exists(path.join(dir, 'library.json'))) return dir;
  }
  return undefined;
}

const SKIP = /^(unins|setup|vcredist|dxsetup|dotnet|crashhandler|uninstall)/i;

/** The program to start, the way Quiver's own desktop shortcuts do: straight at the game. */
async function programOf(install: QuiverInstall): Promise<string | undefined> {
  const dir = install.dir;
  if (!dir) return undefined;
  const named = install.launch?.executable || install.program;
  if (named) return path.isAbsolute(named) ? named : path.join(dir, named);
  // Nothing recorded: take the most promising .exe in the folder, biggest first, then one folder down.
  const best: { file: string; size: number }[] = [];
  const look = async (at: string, depth: number) => {
    let entries: import('node:fs').Dirent[] = [];
    try {
      entries = await fs.readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(at, e.name);
      if (e.isFile() && e.name.toLowerCase().endsWith('.exe') && !SKIP.test(e.name)) {
        const size = await fs.stat(full).then((s) => s.size, () => 0);
        best.push({ file: full, size });
      } else if (e.isDirectory() && depth > 0 && !/^(mods|saves|data|docs)$/i.test(e.name)) {
        await look(full, depth - 1);
      }
    }
  };
  await look(dir, 1);
  best.sort((a, b) => b.size - a.size);
  return best[0]?.file;
}

/** Quiver's artwork is already the shape Lumen wants: a capsule for the tile, a hero and a logo. */
function artOf(art: QuiverArt | undefined, artwork: string | undefined): ScannedGame['art'] {
  return {
    cover: art?.capsule ?? artwork,
    hero: art?.hero ?? art?.header,
    logo: art?.logo,
    alts: [art?.header, artwork].filter((u): u is string => !!u && u !== (art?.capsule ?? artwork))
  };
}

/** A value by any letter case, since Quiver 3 wrote both camelCase and PascalCase. */
function pick(o: any, name: string): any {
  if (!o || typeof o !== 'object') return undefined;
  const key = Object.keys(o).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : o[key];
}
const text = (o: any, name: string): string | undefined => {
  const v = pick(o, name);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

/** Quiver Launcher 3: an apps.json (or games.json) listing each app, its folder and its picture. */
async function scanV3(): Promise<ScannedGame[]> {
  for (const dir of V3_DIRS()) {
    for (const name of ['apps.json', 'games.json']) {
      const doc: any = await readJson<any>(path.join(dir, name));
      const list = pick(doc, 'apps') ?? pick(doc, 'games') ?? (Array.isArray(doc) ? doc : undefined);
      if (!Array.isArray(list) || !list.length) continue;
      const settings: any = await readJson<any>(path.join(dir, 'settings.json'));
      const appsPath = text(settings, 'appsPath');
      const folders = [appsPath && (path.isAbsolute(appsPath) ? appsPath : path.join(dir, appsPath)), path.join(dir, 'Apps')]
        .filter((f): f is string => !!f);
      const games: ScannedGame[] = [];
      for (const app of list) {
        const title = text(app, 'name');
        if (!title) continue;
        const own = text(app, 'installPath');
        const folder = text(app, 'folderName');
        const candidates = [
          own && (path.isAbsolute(own) ? own : path.join(dir, own)),
          ...(folder ? folders.map((f) => path.join(f, folder)) : [])
        ].filter((c): c is string => !!c);
        let found: string | undefined;
        for (const c of candidates) if (await exists(c)) { found = c; break; }
        if (!found) continue;
        const exe = await programOf({ dir: found, program: text(app, 'program') });
        if (!exe) continue;
        const icon = text(app, 'icon');
        games.push({
          id: `quiver:v3:${text(app, 'repository') ?? folder ?? title}`,
          source: 'quiver',
          sourceGameId: `v3:${text(app, 'repository') ?? folder ?? title}`,
          title,
          installDir: found,
          launch: { kind: 'exe', target: exe, cwd: found },
          art: icon && /^https?:/i.test(icon) ? { cover: icon } : {}
        });
      }
      if (games.length) return games;
    }
  }
  return [];
}

export async function scanQuiver(custom?: string): Promise<ScannedGame[]> {
  const dir = await dataDir(custom);
  // No Tauri-era folder: this may still be Quiver Launcher 3, which kept a plain apps.json.
  if (!dir) return scanV3();
  const [library, installs, catalog] = await Promise.all([
    readJson<QuiverItem[]>(path.join(dir, 'library.json')),
    readJson<Record<string, QuiverInstall>>(path.join(dir, 'installs.json')),
    readJson<Record<string, QuiverEntry>>(path.join(dir, 'catalog.json'))
  ]);
  if (!Array.isArray(library)) return scanV3();
  const games: ScannedGame[] = [];
  for (const item of library) {
    if (!item?.id || item.removed) continue;
    const entry = catalog?.[item.id];
    const install = installs?.[item.id] ?? {};
    const title = item.overrides?.name || entry?.name || item.local?.name || item.slug || item.id;
    const exe = await programOf(install);
    if (!exe) continue; // Not installed here, or nothing to start: Quiver itself handles getting it.
    games.push({
      id: `quiver:${item.id}`,
      source: 'quiver',
      sourceGameId: item.id,
      title,
      installDir: install.dir,
      launch: { kind: 'exe', target: exe, cwd: install.dir },
      art: artOf(item.art?.libraryArt ?? entry?.libraryArt, item.overrides?.cover ?? item.art?.artwork ?? entry?.artwork)
    });
  }
  // An empty 4.x library on a PC that still has a 3.x one: show the older games rather than nothing.
  return games.length ? games : scanV3();
}
