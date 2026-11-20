import type { ScannedGame } from '../../shared/types';
import { uninstallEntries, unquote } from '../util';

// Battle.net uninstall entries carry an internal uid; the launcher wants a product code.
const CODES: Record<string, string> = {
  wow: 'WoW', wow_classic: 'WoWC', wow_classic_era: 'WoWC', diablo3: 'D3', fenris: 'Fen', osi: 'OSI',
  prometheus: 'Pro', hs_beta: 'WTCG', heroes: 'Hero', s2: 'S2', s1: 'S1', w3: 'W3', odin: 'ODIN',
  lazarus: 'LAZR', zeus: 'ZEUS', viper: 'VIPR', fore: 'FORE', spot: 'SPOT', auks: 'AUKS', wlby: 'WLBY',
  rtro: 'RTRO', anbs: 'ANBS', aqua: 'AQUA', gryphon: 'GRY', pinta: 'PINTA', lbra: 'LBRA'
};

export async function scanBattlenet(): Promise<ScannedGame[]> {
  const games: ScannedGame[] = [];
  for (const k of await uninstallEntries()) {
    const v = k.values;
    if (!/blizzard|activision/i.test(v.Publisher ?? '')) continue;
    const uid = (v.UninstallString ?? '').match(/--uid=([\w-]+)/i)?.[1]?.toLowerCase();
    if (!uid || uid === 'battle.net' || !v.DisplayName || /^battle\.net$/i.test(v.DisplayName)) continue;
    const code = CODES[uid] ?? CODES[uid.replace(/_.*$/, '')];
    const dir = v.InstallLocation ? unquote(v.InstallLocation) : undefined;
    games.push({
      id: `battlenet:${uid}`,
      source: 'battlenet',
      sourceGameId: uid,
      title: v.DisplayName,
      installDir: dir,
      launch: { kind: 'url', target: code ? `battlenet://${code}` : 'battlenet://' },
      art: {}
    });
  }
  return games;
}
