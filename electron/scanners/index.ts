import type { ScanReport, ScannedGame, Settings, SourceId } from '../../shared/types';
import { scanAmazon } from './amazon';
import { scanBattlenet } from './battlenet';
import { scanEa } from './ea';
import { scanEpic } from './epic';
import { scanGog } from './gog';
import { scanQuiver } from './quiver';
import { scanSteam } from './steam';
import { scanUbisoft } from './ubisoft';
import { scanXbox } from './xbox';

const SCANNERS: Record<Exclude<SourceId, 'manual'>, (s: Settings) => Promise<ScannedGame[]>> = {
  steam: (s) => scanSteam(s.customPaths.steam),
  epic: (s) => scanEpic(s.customPaths.epic),
  gog: () => scanGog(),
  ea: () => scanEa(),
  ubisoft: () => scanUbisoft(),
  xbox: () => scanXbox(),
  battlenet: () => scanBattlenet(),
  amazon: () => scanAmazon(),
  quiver: (s) => scanQuiver(s.customPaths.quiver)
};

export async function scanAll(settings: Settings): Promise<{ games: ScannedGame[]; reports: ScanReport[] }> {
  const entries = Object.entries(SCANNERS).filter(([id]) => settings.enabledSources[id as SourceId] !== false);
  const results = await Promise.all(
    entries.map(async ([id, fn]) => {
      const t = Date.now();
      try {
        const games = await fn(settings);
        return { games, report: { source: id as SourceId, found: games.length, ms: Date.now() - t } };
      } catch (e: any) {
        return { games: [], report: { source: id as SourceId, found: 0, error: String(e?.message ?? e), ms: Date.now() - t } };
      }
    })
  );
  return { games: results.flatMap((r) => r.games), reports: results.map((r) => r.report) };
}
