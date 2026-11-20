import type { ScannedGame } from '../../shared/types';
import { uninstallEntries, unquote } from '../util';

export async function scanAmazon(): Promise<ScannedGame[]> {
  const games: ScannedGame[] = [];
  for (const k of await uninstallEntries()) {
    const v = k.values;
    const u = v.UninstallString ?? '';
    if (!/Amazon Game Remover/i.test(u)) continue;
    const pid = u.match(/-p\s+([\w-]+)/i)?.[1];
    if (!pid || !v.DisplayName) continue;
    games.push({
      id: `amazon:${pid}`,
      source: 'amazon',
      sourceGameId: pid,
      title: v.DisplayName,
      installDir: v.InstallLocation ? unquote(v.InstallLocation) : undefined,
      launch: { kind: 'url', target: `amazon-games://play/${pid}` },
      art: {}
    });
  }
  return games;
}
