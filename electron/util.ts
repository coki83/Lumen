import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function run(cmd: string, args: string[], timeoutMs = 20000): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      // reg.exe exits with code 1 when a key does not exist; treat that as "no data".
      if (err && !stdout) return resolve('');
      resolve(stdout.toString());
    });
  });
}

export interface RegKey {
  path: string;
  name: string; // last path segment
  values: Record<string, string>;
}

/** Parses the output of `reg query <key> /s` into keys and their values. */
export function parseRegOutput(out: string): RegKey[] {
  const keys: RegKey[] = [];
  let current: RegKey | undefined;
  for (const raw of out.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (/^HKEY_/i.test(raw)) {
      const p = raw.trim();
      current = { path: p, name: p.split('\\').pop() ?? p, values: {} };
      keys.push(current);
      continue;
    }
    const m = raw.match(/^\s{2,}(.*?)\s{2,}(REG_\w+)\s{2,}(.*)$/) ?? raw.match(/^\s{2,}(.*?)\s{2,}(REG_\w+)\s*$/);
    if (m && current) {
      const name = m[1] === '(Default)' ? '' : m[1];
      let value = m[3] ?? '';
      if (m[2] === 'REG_DWORD' && value.startsWith('0x')) value = String(parseInt(value, 16));
      current.values[name] = value;
    }
  }
  return keys;
}

export async function regQuery(key: string, recursive = true): Promise<RegKey[]> {
  if (process.platform !== 'win32') return [];
  const args = ['query', key];
  if (recursive) args.push('/s');
  return parseRegOutput(await run('reg', args));
}

export async function regValue(key: string, value: string): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined;
  const out = await run('reg', ['query', key, '/v', value]);
  const keys = parseRegOutput(out);
  for (const k of keys) if (value in k.values) return k.values[value];
  return undefined;
}

export const UNINSTALL_ROOTS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];

let uninstallCache: { at: number; keys: RegKey[] } | undefined;
/** All "Programs and Features" entries, cached for a few seconds so several scanners can share one read. */
export async function uninstallEntries(): Promise<RegKey[]> {
  if (uninstallCache && Date.now() - uninstallCache.at < 15000) return uninstallCache.keys;
  const all = (await Promise.all(UNINSTALL_ROOTS.map((r) => regQuery(r)))).flat();
  // Only direct children of the Uninstall key are programs.
  const keys = all.filter((k) => /\\Uninstall\\[^\\]+$/i.test(k.path));
  uninstallCache = { at: Date.now(), keys };
  return keys;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(p: string): Promise<string | undefined> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return undefined;
  }
}

export async function listDir(p: string): Promise<string[]> {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
  }
}

export function unquote(s: string): string {
  return s.trim().replace(/^"(.*)"$/, '$1');
}

export function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function programData(): string {
  return env('ProgramData', 'C:\\ProgramData');
}

export function join(...parts: string[]): string {
  return path.win32.join(...parts);
}

/** Minimal Valve KeyValues (VDF / ACF) parser. */
export function parseVdf(text: string): Record<string, any> {
  let i = 0;
  const n = text.length;
  const skip = () => {
    while (i < n) {
      const c = text[i];
      if (c === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++;
      } else if (/\s/.test(c)) i++;
      else break;
    }
  };
  const str = (): string => {
    skip();
    if (text[i] === '"') {
      i++;
      let s = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const next = text[i + 1];
          s += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
        } else s += text[i++];
      }
      i++;
      return s;
    }
    let s = '';
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    return s;
  };
  const obj = (): Record<string, any> => {
    const o: Record<string, any> = {};
    while (true) {
      skip();
      if (i >= n) return o;
      if (text[i] === '}') {
        i++;
        return o;
      }
      const key = str();
      skip();
      if (text[i] === '{') {
        i++;
        o[key] = obj();
      } else o[key] = str();
    }
  };
  return obj();
}

/** Case-insensitive property lookup, because VDF keys vary in case between Steam versions. */
export function ci(o: Record<string, any> | undefined, key: string): any {
  if (!o) return undefined;
  const k = Object.keys(o).find((x) => x.toLowerCase() === key.toLowerCase());
  return k === undefined ? undefined : o[k];
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
