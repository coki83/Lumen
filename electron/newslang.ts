// Steam's news feed for a game carries every language the developer posts in, mixed together, so a
// feed can hand you a Russian announcement for a game you read in English. Steam does not let the
// news call ask for one language, so Lumen reads the text itself and keeps what matches.
//
// Two steps: the writing system has to match (no Cyrillic when you read German), and for languages
// that share the Latin alphabet a handful of very common words decide which one it is. Short
// headlines often carry no clue at all, and those are kept rather than thrown away, because a
// title like "Patch 1.4" reads the same in any language.

export type Script = 'latin' | 'cyrillic' | 'greek' | 'han' | 'kana' | 'hangul' | 'arabic' | 'hebrew' | 'thai' | 'none';

const RANGES: [Script, RegExp][] = [
  ['cyrillic', /[Ѐ-ӿ]/g],
  ['greek', /[Ͱ-Ͽ]/g],
  ['han', /[一-鿿]/g],
  ['kana', /[぀-ヿ]/g],
  ['hangul', /[가-힯]/g],
  ['arabic', /[؀-ۿ]/g],
  ['hebrew', /[֐-׿]/g],
  ['thai', /[฀-๿]/g],
  ['latin', /[A-Za-zÀ-ɏ]/g]
];

/** The writing system most of a piece of text is in. */
export function scriptOf(text: string): Script {
  let best: Script = 'none';
  let most = 0;
  for (const [name, re] of RANGES) {
    const n = (text.match(re) ?? []).length;
    if (n > most) { most = n; best = name; }
  }
  return most >= 3 ? best : 'none';
}

/** The writing system each language we offer is read in. */
const SCRIPT_OF_LANG: Record<string, Script> = {
  en: 'latin', de: 'latin', fr: 'latin', es: 'latin', it: 'latin', pt: 'latin', nl: 'latin', pl: 'latin',
  tr: 'latin', sv: 'latin', da: 'latin', no: 'latin', fi: 'latin', cs: 'latin', hu: 'latin', ro: 'latin',
  hr: 'latin', sl: 'latin', sq: 'latin', ru: 'cyrillic', uk: 'cyrillic', bg: 'cyrillic', sr: 'cyrillic',
  mk: 'cyrillic', el: 'greek', zh: 'han', ja: 'kana', ko: 'hangul', ar: 'arabic', he: 'hebrew', th: 'thai'
};

/** Words so common in a language that a few of them settle which one a text is written in. */
const MARKERS: Record<string, string[]> = {
  en: ['the', 'and', 'with', 'for', 'new', 'have', 'this', 'from', 'you', 'now', 'update', 'fixed'],
  de: ['und', 'der', 'die', 'das', 'mit', 'für', 'wir', 'ist', 'nicht', 'neue', 'wurde', 'spiel'],
  fr: ['les', 'des', 'une', 'avec', 'pour', 'nous', 'est', 'dans', 'vous', 'jeu', 'mise', 'nouvelle'],
  es: ['los', 'las', 'una', 'con', 'para', 'por', 'del', 'que', 'nuevo', 'juego', 'ahora', 'está'],
  it: ['del', 'che', 'una', 'con', 'per', 'nel', 'gioco', 'nuovo', 'siamo', 'alla', 'degli', 'questa'],
  pt: ['dos', 'uma', 'com', 'para', 'não', 'você', 'jogo', 'novo', 'agora', 'está', 'também', 'dias'],
  nl: ['het', 'een', 'van', 'met', 'voor', 'niet', 'wij', 'spel', 'nieuwe', 'ook', 'zijn', 'deze'],
  pl: ['nie', 'jest', 'dla', 'oraz', 'przez', 'gry', 'nowe', 'teraz', 'się', 'już', 'można', 'wszystkie'],
  tr: ['bir', 'için', 'daha', 'oyun', 've', 'ile', 'yeni', 'olarak', 'şimdi', 'tüm', 'bu', 'var'],
  sv: ['och', 'att', 'för', 'med', 'inte', 'som', 'spel', 'nya', 'vi', 'den', 'det', 'har'],
  cs: ['pro', 'jsme', 'není', 'hra', 'nové', 'nyní', 'také', 'všechny', 'byl', 'jako', 'více', 'ale'],
  hu: ['hogy', 'nem', 'egy', 'van', 'már', 'még', 'játék', 'új', 'minden', 'volt', 'csak', 'ezt'],
  ro: ['pentru', 'care', 'este', 'nou', 'joc', 'acum', 'toate', 'din', 'cu', 'și', 'mai', 'fost'],
  fi: ['että', 'sekä', 'peli', 'uusi', 'nyt', 'kaikki', 'ovat', 'mutta', 'voit', 'myös', 'tämä', 'kun'],
  da: ['och', 'for', 'ikke', 'spil', 'nye', 'med', 'har', 'vi', 'den', 'det', 'som', 'nu'],
  no: ['ikke', 'for', 'spill', 'nye', 'med', 'har', 'vi', 'den', 'det', 'som', 'nå', 'alle'],
  hr: ['nije', 'igra', 'nove', 'sada', 'sve', 'koji', 'ali', 'samo', 'više', 'ovo', 'smo', 'za'],
  sl: ['ni', 'igra', 'nove', 'zdaj', 'vse', 'ki', 'ampak', 'samo', 'več', 'to', 'smo', 'za'],
  sq: ['për', 'nuk', 'një', 'është', 'lojë', 'tani', 'të', 'me', 'dhe', 'kjo', 'por', 'gjitha']
};

const words = (text: string) => text.toLowerCase().match(/[\p{L}]{2,}/gu) ?? [];

/** How many of a language's marker words a text uses. */
function hits(list: string[], lang: string): number {
  const set = new Set(MARKERS[lang] ?? []);
  if (!set.size) return 0;
  let n = 0;
  for (const w of list) if (set.has(w)) n++;
  return n;
}

/**
 * Whether a piece of news is readable by someone who reads `lang`. 'any' keeps everything.
 * A text whose script is wrong is always dropped. A Latin text is dropped only when another
 * language clearly owns it: that way short, wordless headlines are not thrown away.
 */
export function readableIn(text: string, lang: string): boolean {
  if (!lang || lang === 'any') return true;
  const want = SCRIPT_OF_LANG[lang] ?? 'latin';
  const got = scriptOf(text);
  if (got !== 'none' && got !== want) return false;
  if (want !== 'latin') return true;
  const list = words(text);
  if (list.length < 6) return true; // too short to tell, so give it the benefit of the doubt
  const mine = hits(list, lang);
  if (mine >= 2) return true;
  let other = 0;
  for (const other_lang of Object.keys(MARKERS)) {
    if (other_lang === lang) continue;
    other = Math.max(other, hits(list, other_lang));
  }
  return other < 3;
}

/** The language to read news in: what Settings says, or the language Windows runs in. */
export function newsLang(setting: string | undefined, locale: string): string {
  if (setting && setting !== 'auto') return setting;
  const code = (locale || 'en').toLowerCase().split(/[-_]/)[0];
  return SCRIPT_OF_LANG[code] ? code : 'en';
}
