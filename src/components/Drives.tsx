import { useEffect, useState } from 'react';
import type { DriveInfo } from '../../shared/types';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { Icon } from './Icon';

/** Bytes as the size people expect to read on a drive: 184 GB, 1.2 TB. */
export function size(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1000) return `${(gb / 1024).toFixed(gb / 1024 >= 10 ? 0 : 1)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** Reads the drives when the panel appears, then again every minute. */
export function useDrives(on = true): DriveInfo[] {
  const [list, setList] = useState<DriveInfo[]>([]);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const read = () => api.drives().then((d) => alive && setList(d)).catch(() => {});
    read();
    const again = window.setInterval(read, 60000);
    return () => { alive = false; window.clearInterval(again); };
  }, [on]);
  return list;
}

/** How full a drive is: full enough to warn about at 90%, tight at 80%. */
function state(d: DriveInfo): string {
  const used = 1 - d.free / Math.max(1, d.total);
  return used >= 0.9 ? 'full' : used >= 0.8 ? 'tight' : '';
}

export function DriveRow({ d, games }: { d: DriveInfo; games?: number }) {
  const used = Math.min(100, Math.max(0, (1 - d.free / Math.max(1, d.total)) * 100));
  return (
    <div className={`drive ${state(d)}`} title={`${d.letter} ${d.label} · ${size(d.free)} ${t('free')} · ${size(d.total)}`}>
      <div className="drive-head">
        <Icon name={d.removable ? 'usb' : 'disk'} size={14} />
        <b>{d.letter}</b>
        {d.label && <span className="drive-name">{d.label}</span>}
        <span className="drive-free">{size(d.free)}</span>
      </div>
      <div className="drive-bar"><i style={{ width: `${used}%` }} /></div>
      <small>{t('{free} free of {total}', { free: size(d.free), total: size(d.total) })}{games ? ` · ${t('{n} games here', { n: games })}` : ''}</small>
    </div>
  );
}

/** The list of drives, used in the sidebar, in Settings and on the Big Screen menu. */
export function Drives({ compact, counts }: { compact?: boolean; counts?: Record<string, number> }) {
  const drives = useDrives();
  if (!drives.length) return null;
  return (
    <div className={`drives ${compact ? 'compact' : ''}`}>
      {drives.map((d) => <DriveRow key={d.letter} d={d} games={counts?.[d.letter]} />)}
    </div>
  );
}

/** How many of your installed games sit on each drive, counted from their install folders. */
export function driveCounts(games: { installed?: boolean; installDir?: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of games) {
    const m = /^([A-Za-z]:)/.exec(g.installDir ?? '');
    if (!g.installed || !m) continue;
    const key = m[1].toUpperCase();
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
