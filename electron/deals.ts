// Current sales and best sellers from the stores' own public storefront data.
import { app } from 'electron';
import type { DealItem, DealSection } from '../shared/types';
import { steamItems } from './steamstore';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
let cache: { at: number; data: DealSection[] } | undefined;

function country() {
  const c = (app.getLocaleCountryCode?.() || 'US').toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : 'US';
}
const money = (cents: number, cur: string) => {
  try {
    return new Intl.NumberFormat(app.getLocale() || 'en-US', { style: 'currency', currency: cur || 'USD' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
};

async function steamSections(cc: string): Promise<DealSection[]> {
  const r = await fetch(`https://store.steampowered.com/api/featuredcategories?cc=${cc}&l=english`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam returned ${r.status}`);
  const j: any = await r.json();
  const map = (items: any[]): DealItem[] => {
    const seen = new Set<number>();
    return (items ?? [])
      .filter((i) => i.type === 0 && !seen.has(i.id) && seen.add(i.id))
      .map((i) => ({
        id: `steam:${i.id}`,
        store: 'steam' as const,
        title: i.name,
        image: i.header_image || i.large_capsule_image,
        url: `https://store.steampowered.com/app/${i.id}/`,
        price: i.final_price != null ? (i.final_price === 0 ? 'Free' : money(i.final_price, i.currency)) : undefined,
        originalPrice: i.discounted ? money(i.original_price, i.currency) : undefined,
        discount: i.discount_percent || undefined,
        free: i.final_price === 0,
        endsAt: i.discount_expiration ? new Date(i.discount_expiration * 1000).toISOString() : undefined
      }));
  };
  return [
    { id: 'steam-specials', title: 'On sale on Steam', store: 'steam', items: map(j.specials?.items) },
    { id: 'steam-top', title: 'Top sellers on Steam', store: 'steam', items: map(j.top_sellers?.items) },
    { id: 'steam-new', title: 'New on Steam', store: 'steam', items: map(j.new_releases?.items) }
  ];
}

function epicUrl(e: any) {
  const slug = e.catalogNs?.mappings?.[0]?.pageSlug ?? e.offerMappings?.[0]?.pageSlug ?? e.productSlug?.replace(/\/home$/, '') ?? e.urlSlug;
  return slug ? `https://store.epicgames.com/p/${slug}` : 'https://store.epicgames.com/';
}
function epicImage(e: any) {
  const k = (t: string) => e.keyImages?.find((x: any) => x.type === t)?.url;
  return k('OfferImageWide') ?? k('DieselStoreFrontWide') ?? k('featuredMedia') ?? k('Thumbnail') ?? e.keyImages?.[0]?.url;
}
function epicItem(e: any, extra: Partial<DealItem> = {}): DealItem {
  const p = e.price?.totalPrice;
  return {
    id: `epic:${e.namespace}:${e.id}`,
    store: 'epic',
    title: e.title,
    image: epicImage(e),
    url: epicUrl(e),
    price: p ? (p.discountPrice === 0 ? 'Free' : p.fmtPrice?.discountPrice) : undefined,
    originalPrice: p && p.discount > 0 ? p.fmtPrice?.originalPrice : undefined,
    discount: p && p.originalPrice > 0 && p.discount > 0 ? Math.round((p.discount / p.originalPrice) * 100) : undefined,
    ...extra
  };
}

async function epicFree(cc: string): Promise<DealSection> {
  const r = await fetch(`https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=${cc}&allowCountries=${cc}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Epic returned ${r.status}`);
  const j: any = await r.json();
  const items: DealItem[] = [];
  for (const e of j?.data?.Catalog?.searchStore?.elements ?? []) {
    const now = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.find((o: any) => o.discountSetting?.discountPercentage === 0);
    const soon = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.find((o: any) => o.discountSetting?.discountPercentage === 0);
    if (now) items.push(epicItem(e, { price: 'Free', free: true, endsAt: now.endDate, originalPrice: e.price?.totalPrice?.fmtPrice?.originalPrice }));
    else if (soon) items.push(epicItem(e, { price: 'Free soon', free: true, upcoming: true, endsAt: soon.startDate, discount: undefined, originalPrice: undefined }));
  }
  return { id: 'epic-free', title: 'Free on Epic', store: 'epic', items };
}

const GQL = 'https://graphql.epicgames.com/graphql';
const FIELDS = `title id namespace productSlug urlSlug keyImages { type url } catalogNs { mappings(pageType: "productHome") { pageSlug } } offerMappings { pageSlug }
  price(country: $country) { totalPrice { discountPrice originalPrice discount fmtPrice(locale: $locale) { originalPrice discountPrice } } }`;

export async function gql(query: string, variables: any) {
  const r = await fetch(GQL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ query, variables }) });
  if (!r.ok) throw new Error(`Epic returned ${r.status}`);
  const j: any = await r.json();
  if (j.errors?.length && !j.data) throw new Error(j.errors[0].message);
  return j.data;
}

async function epicSale(cc: string): Promise<DealSection> {
  const q = `query($country: String!, $locale: String) { Catalog { searchStore(country: $country, locale: $locale, count: 40, onSale: true, category: "games/edition/base", sortBy: "currentPrice", sortDir: "DESC") { elements { ${FIELDS} } } } }`;
  const d = await gql(q, { country: cc, locale: 'en-US' });
  return { id: 'epic-sale', title: 'On sale on Epic', store: 'epic', items: (d?.Catalog?.searchStore?.elements ?? []).map((e: any) => epicItem(e)).filter((i: DealItem) => i.discount) };
}

async function epicTop(cc: string): Promise<DealSection> {
  const q = `query($country: String!, $locale: String, $slug: String) { Storefront { collectionLayout(locale: $locale, slug: $slug) { collectionOffers { ${FIELDS} } } } }`;
  const d = await gql(q, { country: cc, locale: 'en-US', slug: 'top-sellers' });
  return { id: 'epic-top', title: 'Top sellers on Epic', store: 'epic', items: (d?.Storefront?.collectionLayout?.collectionOffers ?? []).map((e: any) => epicItem(e)) };
}

/**
 * What's trending on Steam, from Steam's own public charts service (the same player numbers the
 * chart sites show). SteamDB itself asks not to be read by programs, so Lumen goes to the source.
 */
async function steamTrending(): Promise<DealSection[]> {
  const r = await fetch('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam charts returned ${r.status}`);
  const ranks: { rank: number; appid: number; last_week_rank?: number; peak_in_game?: number }[] = (await r.json())?.response?.ranks ?? [];
  if (!ranks.length) throw new Error('Steam charts sent no data');
  const climbers = ranks
    .map((x) => ({ ...x, gain: x.last_week_rank && x.last_week_rank > 0 ? x.last_week_rank - x.rank : 101 - x.rank, fresh: !x.last_week_rank || x.last_week_rank <= 0 }))
    .filter((x) => x.fresh || x.gain >= 3)
    .sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.gain - a.gain)
    .slice(0, 16);
  const top = ranks.slice(0, 20);
  const info = await steamItems([...new Set([...climbers, ...top].map((x) => x.appid))]);
  const item = (x: { rank: number; appid: number; peak_in_game?: number }, note: string): DealItem => {
    const it = info.get(x.appid);
    return {
      id: `trend:${note[0]}:${x.appid}`, store: 'steam', title: it?.name ?? `Steam app ${x.appid}`,
      image: it?.art.icon ?? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${x.appid}/header.jpg`,
      url: `https://store.steampowered.com/app/${x.appid}/`, price: note
    };
  };
  const peak = (n?: number) => (n ? `${n.toLocaleString('en-US')} playing at peak today` : '');
  return [
    { id: 'steam-trending', title: 'Trending on Steam this week', store: 'steam', items: climbers.map((x) => item(x, x.fresh ? `#${x.rank} · new in the top 100` : `#${x.rank} · up ${x.gain} places`)) },
    { id: 'steam-played', title: 'Most played on Steam right now', store: 'steam', items: top.map((x) => item(x, [`#${x.rank}`, peak(x.peak_in_game)].filter(Boolean).join(' · '))) }
  ];
}

const safe = async (id: string, title: string, store: 'steam' | 'epic', fn: () => Promise<DealSection | DealSection[]>): Promise<DealSection[]> => {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [r];
  } catch (e: any) {
    return [{ id, title, store, items: [], error: String(e?.message ?? e) }];
  }
};

export async function deals(refresh = false): Promise<DealSection[]> {
  if (cache && !refresh && Date.now() - cache.at < 3600_000) return cache.data;
  const cc = country();
  const parts = await Promise.all([
    safe('steam-trending', 'Trending on Steam this week', 'steam', () => steamTrending()),
    safe('steam-specials', 'On sale on Steam', 'steam', () => steamSections(cc)),
    safe('epic-free', 'Free on Epic', 'epic', () => epicFree(cc)),
    safe('epic-sale', 'On sale on Epic', 'epic', () => epicSale(cc)),
    safe('epic-top', 'Top sellers on Epic', 'epic', () => epicTop(cc))
  ]);
  const order = ['steam-trending', 'steam-played', 'epic-free', 'steam-specials', 'epic-sale', 'steam-top', 'epic-top', 'steam-new'];
  const data = parts.flat().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (data.some((d) => d.items.length)) cache = { at: Date.now(), data };
  return data;
}
