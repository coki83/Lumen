// Controller mouse for launcher windows.
//
// Steam, Epic and the rest put their own windows in front (the Steam "Install" box is the usual one),
// and those windows know nothing about a controller. While Lumen is on a TV there is no mouse to reach
// for, so Lumen runs a small Windows helper that turns the controller into a mouse *only while another
// program is in front*. When Lumen itself is the window you are looking at, the helper does nothing and
// Lumen's own controller handling takes over, so a button press never counts twice.
import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT = String.raw`param([int]$LumenPid = 0)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class LumenPad {
  [StructLayout(LayoutKind.Sequential)] public struct PAD { public ushort wButtons; public byte bLeftTrigger; public byte bRightTrigger; public short sThumbLX; public short sThumbLY; public short sThumbRX; public short sThumbRY; }
  [StructLayout(LayoutKind.Sequential)] public struct STATE { public uint dwPacketNumber; public PAD Gamepad; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")] static extern uint S14(uint i, ref STATE s);
  [DllImport("xinput9_1_0.dll", EntryPoint="XInputGetState")] static extern uint S91(uint i, ref STATE s);
  [DllImport("xinput1_3.dll", EntryPoint="XInputGetState")] static extern uint S13(uint i, ref STATE s);
  static int mode = 0;
  public static uint Get(uint i, ref STATE s) {
    if (mode == 0) {
      try { uint r = S14(i, ref s); mode = 1; return r; } catch {}
      try { uint r = S91(i, ref s); mode = 2; return r; } catch {}
      try { uint r = S13(i, ref s); mode = 3; return r; } catch { mode = 4; }
    }
    if (mode == 1) return S14(i, ref s);
    if (mode == 2) return S91(i, ref s);
    if (mode == 3) return S13(i, ref s);
    return 1167;
  }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
function Click([uint32]$down, [uint32]$up) { [LumenPad]::mouse_event($down, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 25; [LumenPad]::mouse_event($up, 0, 0, 0, [IntPtr]::Zero) }
function Tap([byte]$vk) { [LumenPad]::keybd_event($vk, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 20; [LumenPad]::keybd_event($vk, 0, 2, [IntPtr]::Zero) }
if (-not ('LumenPad' -as [type])) { exit 1 }
$state = New-Object LumenPad+STATE
$point = New-Object LumenPad+POINT
$prev = 0
$nextRepeat = [DateTime]::UtcNow
while ($true) {
 try {
  if ($LumenPid -gt 0 -and -not (Get-Process -Id $LumenPid -ErrorAction SilentlyContinue)) { break }
  $fpid = [uint32]0
  [void][LumenPad]::GetWindowThreadProcessId([LumenPad]::GetForegroundWindow(), [ref]$fpid)
  # Lumen in front: its own controller handling is doing the work.
  if ($fpid -eq $LumenPid) { $prev = 0; Start-Sleep -Milliseconds 90; continue }
  if ([LumenPad]::Get(0, [ref]$state) -ne 0) { Start-Sleep -Milliseconds 250; continue }
  $g = $state.Gamepad
  $x = [int]$g.sThumbLX; $y = [int]$g.sThumbLY
  if ([Math]::Abs($x) -lt 9000) { $x = [int]$g.sThumbRX }
  if ([Math]::Abs($y) -lt 9000) { $y = [int]$g.sThumbRY }
  if ([Math]::Abs($x) -lt 9000) { $x = 0 }
  if ([Math]::Abs($y) -lt 9000) { $y = 0 }
  if ($x -ne 0 -or $y -ne 0) {
    $speed = 13 + ($g.bRightTrigger / 255.0) * 26
    [void][LumenPad]::GetCursorPos([ref]$point)
    [void][LumenPad]::SetCursorPos([int]($point.X + ($x / 32767.0) * $speed), [int]($point.Y - ($y / 32767.0) * $speed))
  }
  $b = [int]$g.wButtons
  $new = $b -band (-bnot $prev)
  if ($new -band 0x1000) { Click 2 4 }            # A: left click
  if ($new -band 0x4000) { Click 8 16 }           # X: right click
  if ($new -band 0x2000) { Tap 27 }               # B: Escape
  if ($new -band 0x8000) { Tap 13 }               # Y: Enter
  if ($new -band 0x0010) { Tap 13 }               # Menu: Enter
  if ($new -band 0x0100) { Tap 9 }                # LB: Tab
  if ($new -band 0x0200) { Tap 9 }                # RB: Tab
  $now = [DateTime]::UtcNow
  $dpad = $b -band 0x000F
  if ($dpad -ne 0 -and ($new -band 0x000F -or $now -gt $nextRepeat)) {
    if ($b -band 1) { Tap 38 } elseif ($b -band 2) { Tap 40 } elseif ($b -band 4) { Tap 37 } elseif ($b -band 8) { Tap 39 }
    if ($new -band 0x000F) { $nextRepeat = $now.AddMilliseconds(360) } else { $nextRepeat = $now.AddMilliseconds(130) }
  }
  $prev = $b
  Start-Sleep -Milliseconds 16
 } catch { Start-Sleep -Milliseconds 500 }
}
`;

let proc: ChildProcess | null = null;
let scriptPath: string | undefined;

async function ensureScript(): Promise<string> {
  const p = path.join(app.getPath('userData'), 'pad-cursor.ps1');
  if (scriptPath !== p) {
    await fs.writeFile(p, '﻿' + SCRIPT, 'utf8');
    scriptPath = p;
  }
  return p;
}

/** Turns the helper on or off. Safe to call as often as you like. */
export async function padCursor(on: boolean): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  if (!on) {
    proc?.kill();
    proc = null;
    return false;
  }
  if (proc && !proc.killed) return true;
  try {
    const file = await ensureScript();
    proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-LumenPid', String(process.pid)], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true
    });
    proc.on('exit', () => { proc = null; });
    proc.on('error', () => { proc = null; });
    return true;
  } catch {
    proc = null;
    return false;
  }
}

export function stopPadCursor() {
  proc?.kill();
  proc = null;
}
