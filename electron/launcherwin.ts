// Keeping the launcher's own window out of the way.
//
// Starting an install hands the job to Steam (or Epic, or GOG), and those clients throw their whole
// window in your face and leave it there. Lumen is meant to be the thing you look at, so once the
// download is actually running this quietly minimizes the launcher's main window. Only the main
// window, matched by its exact title, and only after the install box has been answered, so nothing
// you still need to click is ever hidden.
import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SourceId } from '../shared/types';

/** The exact window title each launcher's main window carries. Anything else is left alone. */
const MAIN_WINDOWS: Partial<Record<SourceId, string[]>> = {
  steam: ['Steam'],
  epic: ['Epic Games Launcher'],
  gog: ['GOG GALAXY'],
  ea: ['EA', 'EA app'],
  ubisoft: ['Ubisoft Connect'],
  battlenet: ['Battle.net'],
  amazon: ['Amazon Games']
};

const SCRIPT = String.raw`param([string]$Titles = '', [int]$Seconds = 30)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class LumenWin {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@
if (-not ('LumenWin' -as [type])) { exit 1 }
$wanted = $Titles -split '\|' | Where-Object { $_ -ne '' }
if (-not $wanted) { exit 0 }
$until = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $until) {
  try {
    foreach ($p in Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }) {
      $t = $p.MainWindowTitle
      if (-not $t) { continue }
      if ($wanted -notcontains $t) { continue }
      # 6 is minimize without stealing the focus on the way.
      [void][LumenWin]::ShowWindow($p.MainWindowHandle, 6)
    }
  } catch {}
  Start-Sleep -Milliseconds 900
}
`;

let scriptPath: string | undefined;

async function ensureScript(): Promise<string> {
  const p = path.join(app.getPath('userData'), 'tuck-launcher.ps1');
  if (scriptPath !== p) {
    await fs.writeFile(p, '﻿' + SCRIPT, 'utf8');
    scriptPath = p;
  }
  return p;
}

/**
 * Keeps the launcher's main window minimized for a few seconds, used once its download is really
 * running. Does nothing away from Windows, and never waits for the result.
 */
export async function tuckLauncher(source: SourceId, seconds = 30): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const titles = MAIN_WINDOWS[source];
  if (!titles?.length) return false;
  try {
    const file = await ensureScript();
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-Titles', titles.join('|'), '-Seconds', String(seconds)], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('error', () => undefined);
    return true;
  } catch {
    return false;
  }
}
