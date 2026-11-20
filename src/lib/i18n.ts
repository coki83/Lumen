// Lumen in your own language.
//
// The keys are the English sentences themselves, so anything a translation does not cover simply
// shows in English instead of a blank or a code. Each language lives in its own file under
// lang/, and `t()` reads the one that is loaded.
import { DICTS } from './lang';

export interface LangDef { id: string; name: string; english: string }

/** The languages Lumen itself speaks. `name` is how that language names itself. */
export const LANGS: LangDef[] = [
  { id: 'en', name: 'English', english: 'English' },
  { id: 'de', name: 'Deutsch', english: 'German' },
  { id: 'es', name: 'Español', english: 'Spanish' },
  { id: 'fr', name: 'Français', english: 'French' },
  { id: 'hr', name: 'Hrvatski', english: 'Croatian' },
  { id: 'it', name: 'Italiano', english: 'Italian' },
  { id: 'mk', name: 'Македонски', english: 'Macedonian' },
  { id: 'pl', name: 'Polski', english: 'Polish' },
  { id: 'pt', name: 'Português', english: 'Portuguese' },
  { id: 'ru', name: 'Русский', english: 'Russian' },
  { id: 'sr', name: 'Српски', english: 'Serbian' },
  { id: 'tr', name: 'Türkçe', english: 'Turkish' }
];

let current = 'en';
let dict: Record<string, string> = {};

/** The language to use: what Settings says, or the one Windows runs in. */
export function pickLang(setting: string | undefined, locale = typeof navigator === 'undefined' ? 'en' : navigator.language): string {
  if (setting && setting !== 'auto') return LANGS.some((l) => l.id === setting) ? setting : 'en';
  const code = (locale || 'en').toLowerCase().split(/[-_]/)[0];
  return LANGS.some((l) => l.id === code) ? code : 'en';
}

export function setLang(code: string) {
  current = code;
  dict = DICTS[code] ?? {};
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}

export const lang = () => current;

/**
 * The text in the current language. `vars` fills {name} style holes, so a sentence can be
 * translated as one piece instead of being glued together from fragments.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = dict[text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return out;
}

/** How complete a translation is, as a share of the English keys. Shown in Settings. */
export function coverage(code: string): number {
  const base = Object.keys(DICTS.en ?? {}).length || 1;
  if (code === 'en') return 1;
  return Math.min(1, Object.keys(DICTS[code] ?? {}).length / base);
}
