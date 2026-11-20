// Temperatures for the CPU, the graphics card, the motherboard and the drives.
//
// Everything here is read from Windows itself, with no helper program installed. That sets the
// limit honestly: Windows will give a graphics card temperature through the NVIDIA driver, a drive
// temperature through the storage counters, and sometimes a vague CPU "thermal zone". A real
// per-core CPU reading and a motherboard reading need a kernel driver, which no part of Windows
// offers, so Lumen does not claim them. A hardware monitor someone runs themselves is read if it
// publishes over WMI, but Lumen neither ships nor installs one.
//
// What is tried, in order:
//   - A hardware monitor over WMI (root/OpenHardwareMonitor or root/LibreHardwareMonitor), for
//     anyone already running one that still publishes there. The only source that has a
//     motherboard, so it wins when it answers.
//   - nvidia-smi, which ships with the NVIDIA driver, for the graphics card.
//   - MSAcpi_ThermalZoneTemperature, built into Windows, which most desktop boards answer vaguely
//     or not at all, as a last resort for the CPU.
//   - The drives themselves, through the storage reliability counters.
// Each source is read in one PowerShell run, because starting PowerShell is the slow part.
import { run } from './util';
import type { TempReading } from '../shared/types';

let cache: { at: number; list: TempReading[] } = { at: 0, list: [] };
let inFlight: Promise<TempReading[]> | undefined;
/** Tells the UI why the list is empty, so Settings can say what to install. */
let lastNote: string | undefined;

const FRESH_MS = 15000;

export function tempsNote(): string | undefined {
  return lastNote;
}

/** Everything that reports a temperature right now. Cached, and read once at a time. */
export function temps(refresh = false): Promise<TempReading[]> {
  if (!refresh && cache.at && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.list);
  if (process.platform !== 'win32') return Promise.resolve(cache.list);
  inFlight ??= readTemps()
    .catch(() => cache.list)
    .finally(() => { inFlight = undefined; });
  return inFlight;
}

const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$out = New-Object System.Collections.ArrayList
function Add-T($kind, $label, $value) {
  if ($null -eq $value) { return }
  $v = [double]$value
  if ($v -le 0 -or $v -gt 150) { return }   # a sensor that is not connected reads 0 or nonsense
  [void]$out.Add("$kind|$label|$([math]::Round($v,1))")
}

# 1. LibreHardwareMonitor / OpenHardwareMonitor, if one of them is running
$sensors = $null
foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
  $s = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Temperature' }
  if ($s) { $sensors = $s; break }
}
if ($sensors) {
  $hw = @{}
  foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
    foreach ($h in (Get-CimInstance -Namespace $ns -ClassName Hardware -ErrorAction SilentlyContinue)) { $hw[$h.Identifier] = $h }
  }
  foreach ($s in $sensors) {
    $parentId = ($s.Parent)
    $parent = $hw[$parentId]
    $type = if ($parent) { [string]$parent.HardwareType } else { [string]$parentId }
    $name = if ($parent) { [string]$parent.Name } else { '' }
    $kind = 'other'
    if ($type -match 'Cpu') { $kind = 'cpu' }
    elseif ($type -match 'Gpu') { $kind = 'gpu' }
    elseif ($type -match 'Mainboard|Motherboard|SuperIO') { $kind = 'board' }
    elseif ($type -match 'Storage|Hdd') { $kind = 'disk' }
    $label = if ($name) { "$name - $($s.Name)" } else { [string]$s.Name }
    Add-T $kind $label $s.Value
  }
  Write-Output 'SOURCE|hardware monitor'
}

if (-not $sensors) {
  # 2. NVIDIA's own tool, part of the driver
  $smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if (-not $smi -and (Test-Path "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe")) { $smi = "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe" }
  if ($smi) {
    $path = if ($smi -is [string]) { $smi } else { $smi.Source }
    $lines = & $path --query-gpu=name,temperature.gpu --format=csv,noheader,nounits 2>$null
    foreach ($l in $lines) {
      $p = $l -split ','
      if ($p.Count -ge 2) { Add-T 'gpu' ($p[0].Trim()) ($p[1].Trim()) }
    }
  }
  # 3. Windows' own thermal zones, tenths of a Kelvin
  foreach ($z in (Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue)) {
    Add-T 'cpu' 'Thermal zone' (($z.CurrentTemperature / 10) - 273.15)
  }
}

# 4. The drives answer for themselves, whatever else is running
foreach ($d in (Get-PhysicalDisk -ErrorAction SilentlyContinue)) {
  $c = $d | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
  if ($c -and $c.Temperature) { Add-T 'disk' ([string]$d.FriendlyName) $c.Temperature }
}

$out | ForEach-Object { $_ }
`;

const KINDS = new Set(['cpu', 'gpu', 'board', 'disk', 'other']);

/**
 * Why nothing came back. Without a helper program there are only two real answers, and neither of
 * them is something to fix by installing anything, so the message says what the PC can do rather
 * than what to go and get.
 */
async function why(): Promise<string> {
  const out = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "if (Get-PhysicalDisk -ErrorAction SilentlyContinue) { 'ok' } else { 'quiet' }"], 15000).catch(() => '')).trim();
  if (/ok/.test(out)) return 'This PC reports no temperature that Windows can read on its own. Desktop boards usually keep the CPU and motherboard sensors behind a driver, and Windows has no way in; a graphics card answers through the NVIDIA driver and a drive through its own counters, and neither answered here.';
  return 'Windows answered nothing at all. PowerShell may be blocked on this PC, which is how Lumen asks for every reading.';
}

async function readTemps(): Promise<TempReading[]> {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], 20000);
  const list: TempReading[] = [];
  let source: TempReading['source'] = 'windows';
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split('|');
    if (parts[0] === 'SOURCE') { source = 'monitor'; continue; }
    const [kind, label, value] = parts;
    if (!KINDS.has(kind) || !label) continue;
    const celsius = Number(value);
    if (!Number.isFinite(celsius)) continue;
    list.push({ kind: kind as TempReading['kind'], label: label.trim(), celsius, source: 'windows' });
  }
  for (const r of list) r.source = source;
  return keep(list);
}

/**
 * Sorts, remembers and explains one read. A read that comes back empty keeps the last good list for
 * five minutes, because a single missed answer should not blank the panel while you play.
 */
async function keep(list: TempReading[]): Promise<TempReading[]> {
  const seen = new Set<string>();
  const once = list.filter((r) => {
    const key = `${r.kind}|${r.label}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  const order = { cpu: 0, gpu: 1, board: 2, disk: 3, other: 4 } as const;
  once.sort((a, b) => order[a.kind] - order[b.kind] || b.celsius - a.celsius || a.label.localeCompare(b.label));
  lastNote = once.length ? undefined : await why();
  if (!once.length && cache.list.length && Date.now() - cache.at < 5 * 60 * 1000) return cache.list;
  cache = { at: Date.now(), list: once };
  return once;
}
