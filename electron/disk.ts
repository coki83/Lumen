import { run } from './util';
import type { DriveInfo } from '../shared/types';

// Windows reports a few drive types; 3 is a fixed disk, 2 a removable one (a USB drive with games on it).
const WANTED = new Set(['2', '3']);

let cache: { at: number; list: DriveInfo[] } = { at: 0, list: [] };
let inFlight: Promise<DriveInfo[]> | undefined;

const FRESH_MS = 45000;

/** The drives Windows can see, with how much room is left on each. Cached, and read once at a time:
 *  three panels can ask together and PowerShell is only started once. */
export function drives(refresh = false): Promise<DriveInfo[]> {
  if (!refresh && cache.list.length && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.list);
  if (process.platform !== 'win32') return Promise.resolve(cache.list);
  inFlight ??= readDrives().finally(() => { inFlight = undefined; });
  return inFlight;
}

async function readDrives(): Promise<DriveInfo[]> {
  const ps =
    'Get-CimInstance Win32_LogicalDisk | ForEach-Object { ' +
    "\"$($_.DeviceID)|$($_.VolumeName)|$($_.Size)|$($_.FreeSpace)|$($_.DriveType)\" }";
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 12000);
  const list: DriveInfo[] = [];
  for (const line of out.split(/\r?\n/)) {
    const [letter, label, size, free, type] = line.trim().split('|');
    if (!letter || !/^[A-Za-z]:$/.test(letter) || !WANTED.has((type ?? '').trim())) continue;
    const total = Number(size);
    const left = Number(free);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(left)) continue;
    list.push({ letter: letter.toUpperCase(), label: (label ?? '').trim(), total, free: left, removable: type.trim() === '2' });
  }
  list.sort((a, b) => a.letter.localeCompare(b.letter));
  // A drive that answers nothing this time (a sleeping disk, a busy machine) should not wipe the panel.
  if (!list.length) return cache.list;
  cache = { at: Date.now(), list };
  return list;
}
