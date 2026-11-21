import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { app } from 'electron';
import path from 'node:path';
import { run } from './util';
import type { VoiceState } from '../shared/types';

/**
 * Voice control.
 *
 * Lumen brings no speech engine of its own and sends nothing anywhere: this drives the recogniser
 * that is already part of Windows (System.Speech), through a PowerShell helper that listens on the
 * default microphone and prints one line of JSON per phrase it hears.
 *
 * The helper is given a closed list of phrases, each one behind the wake words, so it can only
 * ever hear a command of ours. That is also what makes it accurate without any training: the
 * engine is choosing between a few hundred known phrases, not transcribing free speech.
 */

const SCRIPT = String.raw`
param([string]$PhraseFile)
$ErrorActionPreference = 'Stop'
$out = [Console]::Out
function Say($o) { $out.WriteLine(($o | ConvertTo-Json -Compress)); $out.Flush() }
try {
  Add-Type -AssemblyName System.Speech
  $phrases = Get-Content -Raw -Encoding UTF8 $PhraseFile | ConvertFrom-Json
  if (-not $phrases -or $phrases.Count -eq 0) { Say @{ error = 'no phrases' }; exit 1 }

  # The phrases are English, so ask for the English recogniser and only fall back to whatever
  # this PC has if there is no English one installed.
  $rec = $null
  try { $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine (New-Object System.Globalization.CultureInfo 'en-US') }
  catch { $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine }
  $rec.SetInputToDefaultAudioDevice()

  $ch = New-Object System.Speech.Recognition.Choices
  foreach ($p in $phrases) { if ($p) { $ch.Add([string]$p) } }
  $gb = New-Object System.Speech.Recognition.GrammarBuilder
  $gb.Append('__WAKE__')
  $gb.Append($ch)
  $rec.LoadGrammar((New-Object System.Speech.Recognition.Grammar $gb))
  Say @{ ready = $true }

  while ($true) {
    $r = $rec.Recognize([TimeSpan]::FromSeconds(8))
    if ($r -ne $null) { Say @{ text = $r.Text; confidence = [math]::Round([double]$r.Confidence, 3) } }
  }
} catch {
  Say @{ error = [string]$_.Exception.Message }
  exit 1
}
`;

/** Below this the engine was guessing, and acting on a guess is worse than missing a command. */
const MIN_CONFIDENCE = 0.55;

let child: ChildProcess | null = null;
let state: VoiceState = { supported: process.platform === 'win32', listening: false, error: null };
let onHeard: (said: string, confidence: number) => void = () => {};
let onState: (s: VoiceState) => void = () => {};

export function voiceState(): VoiceState {
  return { ...state };
}

export function onVoice(heard: typeof onHeard, changed: typeof onState) {
  onHeard = heard;
  onState = changed;
}

function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  onState(voiceState());
}

/** Starts listening for the given phrases. Starting again swaps the phrase list. */
export async function startVoice(phrases: string[], wake: string): Promise<VoiceState> {
  await stopVoice();
  if (process.platform !== 'win32') {
    set({ supported: false, listening: false, error: 'Voice control needs Windows.' });
    return voiceState();
  }
  if (!phrases.length) {
    set({ listening: false, error: 'Nothing to listen for.' });
    return voiceState();
  }
  const dir = path.join(app.getPath('userData'), 'voice');
  await fs.mkdir(dir, { recursive: true });
  const scriptPath = path.join(dir, 'listen.ps1');
  const phrasePath = path.join(dir, 'phrases.json');
  await fs.writeFile(scriptPath, SCRIPT.replace('__WAKE__', wake.replace(/'/g, "''")), 'utf8');
  await fs.writeFile(phrasePath, JSON.stringify(phrases), 'utf8');

  const ps = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PhraseFile', phrasePath],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child = ps;
  set({ listening: false, error: null });

  let rest = '';
  ps.stdout?.on('data', (buf: Buffer) => {
    rest += buf.toString();
    const lines = rest.split(/\r?\n/);
    rest = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: { ready?: boolean; text?: string; confidence?: number; error?: string };
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.error) set({ listening: false, error: friendly(msg.error) });
      else if (msg.ready) set({ listening: true, error: null });
      else if (msg.text && (msg.confidence ?? 0) >= MIN_CONFIDENCE) onHeard(msg.text, msg.confidence ?? 0);
    }
  });
  ps.stderr?.on('data', (buf: Buffer) => {
    const t = buf.toString().trim();
    if (t) set({ error: friendly(t.split(/\r?\n/)[0]) });
  });
  ps.on('exit', () => {
    if (child === ps) { child = null; set({ listening: false }); }
  });
  ps.on('error', (e) => set({ listening: false, error: friendly(e.message) }));
  return voiceState();
}

export async function stopVoice(): Promise<void> {
  const ps = child;
  child = null;
  if (!ps) { set({ listening: false }); return; }
  // PowerShell sits inside Recognize(), so it has to be taken down with its whole tree.
  if (process.platform === 'win32' && ps.pid) await run('taskkill', ['/pid', String(ps.pid), '/T', '/F'], 5000);
  else ps.kill();
  set({ listening: false });
}

/** Turns the engine's own wording into something worth reading. */
function friendly(msg: string): string {
  if (/SetInputToDefaultAudioDevice|audio device|No recognizer/i.test(msg)) {
    return 'No microphone, or no speech recogniser is set up in Windows. Windows Settings → Time & language → Speech.';
  }
  if (/Access is denied|privacy/i.test(msg)) {
    return 'Windows is not letting Lumen use the microphone. Windows Settings → Privacy → Microphone.';
  }
  return msg.slice(0, 200);
}
