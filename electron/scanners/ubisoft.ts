import type { ScannedGame } from '../../shared/types';
import { regQuery, uninstallEntries } from '../util';

export async function scanUbisoft(): Promise<ScannedGame[]> {
  const installs = await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs');
  const names = new Map<string, string>();
  for (const k of await uninstallEntries()) {
    const m = k.name.match(/^Uplay Install (\d+)$/i);
    if (m && k.values.DisplayName) names.set(m[1], k.values.DisplayName);
  }
  const games: ScannedGame[] = [];
  for (const k of installs) {
    if (!/^\d+$/.test(k.name) || !k.values.InstallDir) continue;
    const dir = k.values.InstallDir.replace(/\//g, '\\').replace(/\\$/, '');
    const title = names.get(k.name) ?? dir.split('\\').pop() ?? `Ubisoft game ${k.name}`;
    games.push({
      id: `ubisoft:${k.name}`,
      source: 'ubisoft',
      sourceGameId: k.name,
      title,
      installDir: dir,
      launch: { kind: 'url', target: `uplay://launch/${k.name}/0` },
      art: {}
    });
  }
  return games;
}
