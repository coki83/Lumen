// Gaming news from Google News.
//
// Google News publishes every topic page as plain RSS: the same address with /rss/ in front of
// /topics/ gives the feed behind the page. Lumen reads the gaming topic, which is a whole industry
// of sites rather than the Steam pages of one player's own games.
//
// Nothing about the player is sent. The request carries the topic, the language and the country,
// and no cookie, no library and no identifier of any kind.
import type { PulseItem } from '../shared/types';

/** The gaming topic, from the Google News address Coki asked for. */
const TOPIC = 'CAAqIQgKIhtDQkFTRGdvSUwyMHZNREZ0ZHpFU0FtVnVLQUFQAQ';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * Which edition of Google News to ask for. A topic is numbered the same in every edition, so the
 * player's own language can be asked for and English used when that edition has nothing.
 */
const EDITION: Record<string, { hl: string; gl: string }> = {
  en: { hl: 'en-US', gl: 'US' },
  de: { hl: 'de', gl: 'DE' },
  es: { hl: 'es', gl: 'ES' },
  fr: { hl: 'fr', gl: 'FR' },
  it: { hl: 'it', gl: 'IT' },
  pl: { hl: 'pl', gl: 'PL' },
  pt: { hl: 'pt-PT', gl: 'PT' },
  ru: { hl: 'ru', gl: 'RU' },
  tr: { hl: 'tr', gl: 'TR' },
  hr: { hl: 'hr', gl: 'HR' },
  sr: { hl: 'sr', gl: 'RS' },
  mk: { hl: 'mk', gl: 'MK' }
};

function feedUrl(lang: string): string {
  const e = EDITION[lang] ?? EDITION.en;
  return `https://news.google.com/rss/topics/${TOPIC}?hl=${e.hl}&gl=${e.gl}&ceid=${e.gl}:${e.hl.split('-')[0]}`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Headlines arrive with their punctuation escaped, sometimes twice over. */
function decode(s: string): string {
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
  }
  return out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decode(m[1]) : '';
}

function attr(block: string, name: string, key: string): string {
  const m = new RegExp(`<${name}\\s[^>]*${key}="([^"]*)"`, 'i').exec(block);
  return m ? decode(m[1]) : '';
}

const agoOf = (ms: number) => {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
};

/**
 * Google ends a headline with " - The Publisher", which is already shown underneath, so it is cut
 * when it is really the publisher's name and not part of the headline itself.
 */
function trimPublisher(title: string, publisher: string): string {
  if (!publisher) return title;
  const tail = ` - ${publisher}`;
  return title.toLowerCase().endsWith(tail.toLowerCase()) ? title.slice(0, -tail.length).trim() : title;
}

/** The publisher's own mark, which is all the artwork a headline has. */
function markOf(sourceUrl: string): string | undefined {
  try {
    const host = new URL(sourceUrl).hostname;
    return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : undefined;
  } catch {
    return undefined;
  }
}

function parse(xml: string): PulseItem[] {
  const out: PulseItem[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const publisher = tag(block, 'source');
    const title = trimPublisher(tag(block, 'title'), publisher);
    const url = tag(block, 'link');
    if (!title || !url) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const at = Date.parse(tag(block, 'pubDate'));
    out.push({
      id: `gnews:${tag(block, 'guid') || url}`,
      title,
      meta: [publisher, Number.isFinite(at) ? agoOf(at) : ''].filter(Boolean).join(' · ') || undefined,
      image: markOf(attr(block, 'source', 'url')),
      url,
      at: Number.isFinite(at) ? at : undefined
    });
  }
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 12);
}

async function ask(lang: string): Promise<PulseItem[]> {
  const r = await fetch(feedUrl(lang), { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!r.ok) throw new Error(`Google News returned ${r.status}`);
  return parse(await r.text());
}

/**
 * The gaming headlines. The player's own language is tried first; an edition with nothing to say
 * falls back to the English one rather than leaving the card empty.
 */
export async function gamingNews(lang: string): Promise<PulseItem[]> {
  const mine = await ask(lang).catch(() => [] as PulseItem[]);
  if (mine.length) return mine;
  return lang === 'en' ? [] : ask('en').catch(() => [] as PulseItem[]);
}

export { parse as parseGoogleNews, feedUrl };
