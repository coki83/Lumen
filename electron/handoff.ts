// Opening a launcher link (steam://, com.epicgames.launcher://, ...) on a PC without that launcher
// makes Windows show "Get an app to open this link". Check first, and send the user to the
// launcher's official download page instead.
import { shell } from 'electron';
import type { SourceId } from '../shared/types';
import { run } from './util';

const LAUNCHERS: Record<string, { name: string; download: string }> = {
  steam: { name: 'Steam', download: 'https://store.steampowered.com/about/' },
  'com.epicgames.launcher': { name: 'Epic Games Launcher', download: 'https://store.epicgames.com/download' },
  goggalaxy: { name: 'GOG Galaxy', download: 'https://www.gog.com/galaxy' },
  origin2: { name: 'EA app', download: 'https://www.ea.com/ea-app' },
  origin: { name: 'EA app', download: 'https://www.ea.com/ea-app' },
  uplay: { name: 'Ubisoft Connect', download: 'https://www.ubisoft.com/en-us/ubisoft-connect/download' },
  battlenet: { name: 'Battle.net', download: 'https://download.battle.net/' },
  'amazon-games': { name: 'Amazon Games', download: 'https://gaming.amazon.com/' }
};

const known = new Map<string, boolean>();

async function registered(scheme: string): Promise<boolean> {
  if (process.platform !== 'win32') return true;
  if (known.has(scheme)) return known.get(scheme)!;
  // A link scheme is usable when HKEY_CLASSES_ROOT\<scheme> has a "URL Protocol" value.
  const out = await run('reg', ['query', `HKCR\\${scheme}`, '/v', 'URL Protocol']);
  const ok = /URL Protocol/i.test(out);
  if (ok) known.set(scheme, true); // only cache hits, so installing the launcher works without a restart
  return ok;
}

export interface HandoffResult { ok: boolean; missingLauncher?: string; error?: string }

/** Opens a launcher link, or the launcher's download page if it isn't installed. */
export async function openLauncherLink(target: string): Promise<HandoffResult> {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(target)?.[1]?.toLowerCase();
  if (!scheme || /^(https?|ms-windows-store|ms-settings|xbox|msxbox)$/.test(scheme)) {
    await shell.openExternal(target);
    return { ok: true };
  }
  if (await registered(scheme)) {
    await shell.openExternal(target);
    return { ok: true };
  }
  const l = LAUNCHERS[scheme];
  if (!l) return { ok: false, error: `No app on this PC opens ${scheme}:// links` };
  await shell.openExternal(l.download);
  return { ok: false, missingLauncher: l.name };
}

/** Where each launcher keeps its own downloads list, so a queued or paused install can be fixed there. */
const DOWNLOADS_PAGE: Partial<Record<SourceId, { name: string; target: string }>> = {
  steam: { name: 'Steam', target: 'steam://open/downloads' },
  epic: { name: 'Epic Games Launcher', target: 'com.epicgames.launcher://apps/downloads' },
  gog: { name: 'GOG Galaxy', target: 'goggalaxy://openGalaxy' },
  ea: { name: 'EA app', target: 'origin2://library/open' },
  ubisoft: { name: 'Ubisoft Connect', target: 'uplay://downloads' },
  xbox: { name: 'Microsoft Store', target: 'ms-windows-store://downloadsandupdates' },
  battlenet: { name: 'Battle.net', target: 'battlenet://' },
  amazon: { name: 'Amazon Games', target: 'amazon-games://' }
};

/** The launcher whose downloads list Lumen can open for this source, if any. */
export function downloadsPageName(source: SourceId): string | undefined {
  return DOWNLOADS_PAGE[source]?.name;
}

/** Opens the launcher's own downloads list, where a paused or queued install can be resumed. */
export async function openDownloadsPage(source: SourceId): Promise<HandoffResult> {
  const page = DOWNLOADS_PAGE[source];
  if (!page) return { ok: false, error: 'That launcher has no downloads page Lumen can open' };
  return openLauncherLink(page.target);
}
