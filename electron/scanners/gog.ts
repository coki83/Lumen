import type { ScannedGame } from '../../shared/types';
import { regQuery, unquote } from '../util';

export async function scanGog(): Promise<ScannedGame[]> {
  const keys = [
    ...(await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games')),
    ...(await regQuery('HKLM\\SOFTWARE\\GOG.com\\Games'))
  ];
  const games: ScannedGame[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const v = k.values;
    const gameId = v.gameID || v.productID;
    if (!gameId || !v.gameName || seen.has(gameId)) continue;
    if (v.dependsOn && v.dependsOn.trim()) continue; // DLC
    seen.add(gameId);
    const exe = v.exe ? unquote(v.exe) : '';
    const cwd = v.workingDir || v.path;
    games.push({
      id: `gog:${gameId}`,
      source: 'gog',
      sourceGameId: gameId,
      title: v.gameName,
      installDir: v.path,
      launch: exe
        ? { kind: 'exe', target: exe, args: v.launchParam ? v.launchParam.split(' ').filter(Boolean) : [], cwd }
        : { kind: 'url', target: `goggalaxy://openGameView/${gameId}` },
      art: {}
    });
  }
  return games;
}

/** GOG's public product API gives us artwork for free. */
export async function gogArt(gameId: string): Promise<{ hero?: string; logo?: string }> {
  try {
    const res = await fetch(`https://api.gog.com/products/${gameId}?expand=description`);
    if (!res.ok) return {};
    const j: any = await res.json();
    const fix = (u?: string) => (u ? (u.startsWith('//') ? `https:${u}` : u) : undefined);
    const img = j.images ?? {};
    return {
      hero: fix(img.background),
      logo: fix(img.logo2x ?? img.logo)
    };
  } catch {
    return {};
  }
}
