// How far you are through a game's achievements.
//
// The count of achievements a game has comes from the store page. How many you have unlocked is
// personal, so it needs your own Steam key and id from Settings. Without those the app still
// shows the total, just not your progress.
import type { AchievementProgress } from '../shared/types';
import * as store from './store';

const cache = new Map<string, { at: number; value: AchievementProgress | undefined }>();
const TTL = 10 * 60 * 1000;

async function fromSteam(appid: string, key: string, steamId: string): Promise<AchievementProgress | undefined> {
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?appid=${appid}&key=${encodeURIComponent(key)}&steamid=${encodeURIComponent(steamId)}&l=en`;
  const r = await fetch(url);
  // 403 means the profile's game details are private; 400 means the game has no achievements.
  if (!r.ok) return undefined;
  const j: any = await r.json();
  const list = j?.playerstats?.achievements;
  if (!Array.isArray(list) || !list.length) return undefined;
  const unlocked = list.filter((a: any) => Number(a?.achieved) === 1);
  const last = unlocked.map((a: any) => Number(a?.unlocktime) || 0).sort((a: number, b: number) => b - a)[0];
  return {
    total: list.length,
    unlocked: unlocked.length,
    lastUnlocked: last ? last * 1000 : undefined,
    // The names come back only when the game publishes its schema in English.
    recent: unlocked
      .sort((a: any, b: any) => (Number(b?.unlocktime) || 0) - (Number(a?.unlocktime) || 0))
      .slice(0, 3)
      .map((a: any) => String(a?.name ?? a?.apiname ?? ''))
      .filter(Boolean)
  };
}

/** Your progress through one game's achievements, or nothing if it can't be known. */
export async function achievementsFor(gameId: string): Promise<AchievementProgress | undefined> {
  const hit = cache.get(gameId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value: AchievementProgress | undefined;
  try {
    const g = await store.findGame(gameId);
    const s = await store.getSettings();
    if (g?.source === 'steam' && /^\d+$/.test(g.sourceGameId) && s.steamApiKey && s.steamId) {
      value = await fromSteam(g.sourceGameId, s.steamApiKey, s.steamId);
    }
  } catch {
    value = undefined;
  }
  cache.set(gameId, { at: Date.now(), value });
  return value;
}
