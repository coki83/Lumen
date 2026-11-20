// How much charge is left in a controller.
//
// There is no clean way to ask. The Gamepad API in the browser has no battery at all, and the one
// Windows call that answers properly for an Xbox pad, XInputGetBatteryInformation, is a C function
// Lumen cannot reach without a native module. What is left is Windows' own device store: a device
// that reports its charge publishes it as a property on its Plug and Play entry, under the key
// below, and PowerShell can read that.
//
// So this works where Windows itself knows the charge, which in practice means a controller paired
// over Bluetooth on Windows 10 or 11. A pad on a cable has nothing to report, because it is running
// off the cable, and a pad on an Xbox wireless adapter usually keeps its charge to itself. When
// nothing comes back Lumen shows no battery rather than inventing one.
import { run } from './util';
import type { PadBattery } from '../shared/types';

const FRESH_MS = 60000;
let cache: { at: number; list: PadBattery[] } = { at: 0, list: [] };
let inFlight: Promise<PadBattery[]> | undefined;

// Everything a controller might be called. Windows lists a pad under several entries at once, one
// of which is the Bluetooth device that actually holds the charge, so the match is on the name.
const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$wanted = 'controller|gamepad|game pad|joystick|dualsense|dualshock|wireless controller|xbox|playstation|nintendo|switch pro|8bitdo|dual ?sense'
foreach ($d in (Get-PnpDevice -PresentOnly)) {
  $name = [string]$d.FriendlyName
  if (-not $name) { continue }
  if ($name -notmatch $wanted) { continue }
  $p = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
  if (-not $p -or $p.Type -eq 'Empty') { continue }
  $v = $p.Data
  if ($null -eq $v) { continue }
  Write-Output "$name|$v"
}
`;

/** What each controller Windows knows the charge of has left. Empty when it knows none. */
export function padBatteries(refresh = false): Promise<PadBattery[]> {
  if (!refresh && cache.at && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.list);
  if (process.platform !== 'win32') return Promise.resolve(cache.list);
  inFlight ??= read()
    .catch(() => cache.list)
    .finally(() => { inFlight = undefined; });
  return inFlight;
}

async function read(): Promise<PadBattery[]> {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], 20000);
  const list: PadBattery[] = [];
  const seen = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    const i = line.lastIndexOf('|');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim();
    const percent = Math.round(Number(line.slice(i + 1).trim()));
    // A charge outside 0 to 100 is some other property that happens to sit under the same key.
    if (!name || !Number.isFinite(percent) || percent < 0 || percent > 100) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ name, percent });
  }
  cache = { at: Date.now(), list };
  return list;
}
