import type { ArtCandidate, ArtSearchResult } from '../shared/types';

const API = 'https://www.steamgriddb.com/api/v2';

async function sgdb(key: string, pathname: string): Promise<any> {
  const res = await fetch(`${API}${pathname}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`SteamGridDB returned ${res.status}`);
  const j: any = await res.json();
  if (!j.success) throw new Error('SteamGridDB request failed');
  return j.data;
}

export async function searchArt(key: string, query: string): Promise<ArtSearchResult[]> {
  if (!key) throw new Error('Add a SteamGridDB API key in Settings → Artwork first.');
  const data = await sgdb(key, `/search/autocomplete/${encodeURIComponent(query)}`);
  return (data ?? []).slice(0, 12).map((d: any) => ({ gameId: d.id, name: d.name }));
}

export async function listArt(key: string, gameId: number, kind: 'cover' | 'hero' | 'logo'): Promise<ArtCandidate[]> {
  const p =
    kind === 'cover' ? `/grids/game/${gameId}?dimensions=600x900,342x482,660x930` : kind === 'hero' ? `/heroes/game/${gameId}` : `/logos/game/${gameId}`;
  const data = await sgdb(key, p);
  return (data ?? []).slice(0, 30).map((d: any) => ({ url: d.url, thumb: d.thumb ?? d.url, width: d.width, height: d.height }));
}

/** Best-effort automatic artwork for a title, used after scans for games without art. */
export async function autoArt(key: string, title: string): Promise<{ cover?: string; hero?: string; logo?: string }> {
  const hits = await searchArt(key, title);
  if (!hits.length) return {};
  const id = hits[0].gameId;
  const [covers, heroes, logos] = await Promise.all([
    listArt(key, id, 'cover').catch(() => []),
    listArt(key, id, 'hero').catch(() => []),
    listArt(key, id, 'logo').catch(() => [])
  ]);
  return { cover: covers[0]?.url, hero: heroes[0]?.url, logo: logos[0]?.url };
}
