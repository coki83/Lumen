import type { ScannedGame } from '../../shared/types';
import { join, listDir, programData, readText } from '../util';

export async function scanEpic(custom?: string): Promise<ScannedGame[]> {
  const dir = custom || join(programData(), 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const games: ScannedGame[] = [];
  for (const file of await listDir(dir)) {
    if (!file.toLowerCase().endsWith('.item')) continue;
    const text = await readText(join(dir, file));
    if (!text) continue;
    let m: any;
    try {
      m = JSON.parse(text);
    } catch {
      continue;
    }
    if (m.bIsIncompleteInstall) continue;
    const cats: string[] = (m.AppCategories ?? []).map((c: string) => String(c).toLowerCase());
    if (cats.length && !cats.includes('games')) continue; // engine plugins, assets, etc.
    if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue; // DLC
    const ns = m.CatalogNamespace ?? m.MainGameCatalogNamespace;
    const item = m.CatalogItemId ?? m.MainGameCatalogItemId;
    const appName = m.AppName;
    const id = ns && item ? `${ns}%3A${item}%3A${appName}` : appName;
    games.push({
      id: `epic:${appName}`,
      source: 'epic',
      sourceGameId: appName,
      title: m.DisplayName ?? appName,
      installDir: m.InstallLocation,
      launch: { kind: 'url', target: `com.epicgames.launcher://apps/${id}?action=launch&silent=true` },
      art: {}
    });
  }
  return games;
}
