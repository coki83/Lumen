import type { ScannedGame } from '../../shared/types';
import { exists, join, readText, slug, uninstallEntries, unquote } from '../util';

/** EA app (and legacy Origin) games, found through their uninstall entries and __Installer metadata. */
export async function scanEa(): Promise<ScannedGame[]> {
  const games: ScannedGame[] = [];
  const seen = new Set<string>();
  for (const k of await uninstallEntries()) {
    const v = k.values;
    const pub = (v.Publisher ?? '').toLowerCase();
    const uninst = (v.UninstallString ?? '').toLowerCase();
    const isEa = uninst.includes('eainstaller') || uninst.includes('ea desktop') || uninst.includes('origin') && pub.includes('electronic arts');
    if (!isEa || !v.DisplayName || !v.InstallLocation) continue;
    if (/^ea app$|^origin$/i.test(v.DisplayName)) continue;
    const dir = unquote(v.InstallLocation).replace(/\\$/, '');
    const xml = (await readText(join(dir, '__Installer', 'installerdata.xml'))) ?? '';
    const contentIds = [...xml.matchAll(/<contentID>([^<]+)<\/contentID>/gi)].map((m) => m[1].trim());
    let exePath = '';
    const fp = xml.match(/<filePath>([^<]+)<\/filePath>/i);
    if (fp) {
      // e.g. "[HKEY_LOCAL_MACHINE\SOFTWARE\...\Install Dir]Game.exe"
      const rel = fp[1].replace(/^\[[^\]]+\]/, '');
      const candidate = join(dir, rel);
      if (await exists(candidate)) exePath = candidate;
    }
    const sid = contentIds[0] ?? slug(v.DisplayName);
    if (seen.has(sid)) continue;
    seen.add(sid);
    games.push({
      id: `ea:${sid}`,
      source: 'ea',
      sourceGameId: sid,
      title: v.DisplayName,
      installDir: dir,
      launch: contentIds.length
        ? { kind: 'url', target: `origin2://game/launch?offerIds=${contentIds.join(',')}&autoDownload=1` }
        : exePath
          ? { kind: 'exe', target: exePath, cwd: dir }
          : { kind: 'url', target: 'origin2://library/open' },
      art: {}
    });
  }
  return games;
}
