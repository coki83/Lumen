// Sign-in for launchers that let a desktop app read your library: Steam, Epic Games and GOG.
// Each sign-in happens on the launcher's own login page in its own window; Lumen never sees your
// password. Tokens are encrypted with Windows' per-user key (Electron safeStorage).
import { app, BrowserWindow, safeStorage, session } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AccountId, AccountInfo, ScannedGame } from '../shared/types';
import { steamItems } from './steamstore';
import { MORE_IDS, PROVIDERS, type MoreId } from './accounts-more';

const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
// Public client ids used by the official launchers and by open-source launchers (Legendary, Heroic, Playnite).
const EPIC_CLIENT = '34a02cf8f4414e29b15921876da36f9a';
const EPIC_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const GOG_CLIENT = '46899977096215655';
const GOG_SECRET = '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';
const GOG_REDIRECT = 'https://embed.gog.com/on_login_success?origin=client';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

interface Stored {
  steam?: { steamId: string; name?: string };
  epic?: { refresh: string; access?: string; accessUntil?: number; accountId: string; name?: string };
  gog?: { refresh: string; access?: string; accessUntil?: number; userId: string; name?: string };
  /** Xbox, Battle.net, Amazon, EA, Ubisoft: whatever their provider needs to remember. */
  more?: Partial<Record<MoreId, Record<string, any>>>;
  counts?: Partial<Record<AccountId, number>>;
  errors?: Partial<Record<AccountId, string>>;
}

const file = () => path.join(app.getPath('userData'), 'accounts.bin');
let cache: Stored | undefined;

async function load(): Promise<Stored> {
  if (cache) return cache;
  try {
    const buf = await fs.readFile(file());
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    cache = JSON.parse(text);
  } catch {
    cache = {};
  }
  return cache!;
}
async function save() {
  const text = JSON.stringify(cache ?? {});
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text);
  await fs.writeFile(file(), data);
}

const isMore = (id: AccountId): id is MoreId => (MORE_IDS as string[]).includes(id);
export const partitionFor = (id: AccountId) => `persist:acct-${id}`;

export async function accountsInfo(): Promise<AccountInfo[]> {
  const s = await load();
  const data = (id: AccountId) => (isMore(id) ? s.more?.[id] : s[id as 'steam' | 'epic' | 'gog']);
  return (['steam', 'epic', 'gog', ...MORE_IDS] as AccountId[]).map((id) => ({
    id,
    signedIn: !!data(id),
    name: (data(id) as any)?.name,
    games: s.counts?.[id],
    error: s.errors?.[id]
  }));
}

function loginWindow(parent: BrowserWindow | undefined, id: AccountId, url: string, title: string) {
  const w = new BrowserWindow({
    width: 520,
    height: 760,
    parent,
    modal: !!parent,
    title,
    autoHideMenuBar: true,
    webPreferences: { partition: partitionFor(id), sandbox: true, contextIsolation: true }
  });
  w.webContents.setUserAgent(UA);
  w.loadURL(url);
  return w;
}

/** Opens the launcher's login page and resolves once the sign-in finished (or rejects if closed). */
export async function signIn(id: AccountId, parent?: BrowserWindow): Promise<AccountInfo[]> {
  const s = await load();
  if (isMore(id)) {
    const title0 = { xbox: 'Xbox', battlenet: 'Battle.net', amazon: 'Amazon Games', ea: 'EA', ubisoft: 'Ubisoft' }[id];
    const data = await PROVIDERS[id].signIn((url, title) => loginWindow(parent, id, url, title || `Sign in to ${title0}`));
    (s.more ??= {})[id] = data;
  }
  if (id === 'steam') {
    const w = loginWindow(parent, id, 'https://store.steampowered.com/login/?redir=account%2F', 'Sign in to Steam');
    const steamId = await new Promise<string>((resolve, reject) => {
      const check = async () => {
        const cookies = await session.fromPartition(partitionFor(id)).cookies.get({ name: 'steamLoginSecure' });
        const c = cookies.find((x) => x.domain?.includes('steampowered.com')) ?? cookies[0];
        if (c) resolve(decodeURIComponent(c.value).split('||')[0].split('|')[0]);
      };
      const t = setInterval(check, 800);
      w.on('closed', () => {
        clearInterval(t);
        reject(new Error('Sign-in window closed'));
      });
    });
    // Visiting the community site once moves the login there too, which the games list needs.
    await w.loadURL('https://steamcommunity.com/my/').catch(() => undefined);
    const name = await w.webContents.executeJavaScript("document.querySelector('.actual_persona_name')?.textContent?.trim() || ''").catch(() => '');
    w.destroy();
    s.steam = { steamId, name: name || undefined };
  }

  if (id === 'epic') {
    const redirect = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT}&responseType=code`;
    const w = loginWindow(parent, id, `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(redirect)}`, 'Sign in to Epic Games');
    const code = await new Promise<string>((resolve, reject) => {
      const onNav = async () => {
        if (!w.webContents.getURL().startsWith('https://www.epicgames.com/id/api/redirect')) return;
        const text = await w.webContents.executeJavaScript('document.body.innerText').catch(() => '');
        try {
          const j = JSON.parse(text);
          if (j.authorizationCode) resolve(j.authorizationCode);
        } catch {}
      };
      w.webContents.on('did-finish-load', onNav);
      w.webContents.on('did-navigate', onNav);
      w.on('closed', () => reject(new Error('Sign-in window closed')));
    });
    w.destroy();
    const tok = await epicToken(`grant_type=authorization_code&code=${encodeURIComponent(code)}&token_type=eg1`);
    s.epic = { refresh: tok.refresh_token, access: tok.access_token, accessUntil: Date.parse(tok.expires_at), accountId: tok.account_id, name: tok.displayName };
  }

  if (id === 'gog') {
    const url = `https://auth.gog.com/auth?client_id=${GOG_CLIENT}&redirect_uri=${encodeURIComponent(GOG_REDIRECT)}&response_type=code&layout=client2`;
    const w = loginWindow(parent, id, url, 'Sign in to GOG');
    const code = await new Promise<string>((resolve, reject) => {
      const look = (_e: unknown, u: string) => {
        if (u.startsWith('https://embed.gog.com/on_login_success')) {
          const c = new URL(u).searchParams.get('code');
          if (c) resolve(c);
        }
      };
      w.webContents.on('will-redirect', look);
      w.webContents.on('did-navigate', look);
      w.on('closed', () => reject(new Error('Sign-in window closed')));
    });
    w.destroy();
    const tok = await gogToken(`grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(GOG_REDIRECT)}`);
    s.gog = { refresh: tok.refresh_token, access: tok.access_token, accessUntil: Date.now() + tok.expires_in * 1000, userId: tok.user_id };
    try {
      const me: any = await (await fetch('https://embed.gog.com/userData.json', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
      s.gog.name = me?.username;
    } catch {}
  }
  if (s.errors) delete s.errors[id];
  await save();
  return accountsInfo();
}

export async function signOut(id: AccountId): Promise<AccountInfo[]> {
  const s = await load();
  if (isMore(id)) delete s.more?.[id];
  else delete s[id];
  if (s.counts) delete s.counts[id];
  if (s.errors) delete s.errors[id];
  await session.fromPartition(partitionFor(id)).clearStorageData().catch(() => undefined);
  await save();
  return accountsInfo();
}

async function epicToken(body: string): Promise<any> {
  const r = await fetch('https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${EPIC_CLIENT}:${EPIC_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.errorMessage ?? `Epic sign-in failed (${r.status})`);
  return j;
}

async function gogToken(query: string): Promise<any> {
  const r = await fetch(`https://auth.gog.com/token?client_id=${GOG_CLIENT}&client_secret=${GOG_SECRET}&${query}`);
  const j: any = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j?.error_description ?? `GOG sign-in failed (${r.status})`);
  return j;
}

async function epicAccess(s: Stored): Promise<string> {
  const e = s.epic!;
  if (e.access && e.accessUntil && e.accessUntil - Date.now() > 60000) return e.access;
  const tok = await epicToken(`grant_type=refresh_token&refresh_token=${encodeURIComponent(e.refresh)}&token_type=eg1`);
  Object.assign(e, { refresh: tok.refresh_token, access: tok.access_token, accessUntil: Date.parse(tok.expires_at), name: tok.displayName ?? e.name });
  await save();
  return e.access!;
}

async function gogAccess(s: Stored): Promise<string> {
  const g = s.gog!;
  if (g.access && g.accessUntil && g.accessUntil - Date.now() > 60000) return g.access;
  const tok = await gogToken(`grant_type=refresh_token&refresh_token=${encodeURIComponent(g.refresh)}`);
  Object.assign(g, { refresh: tok.refresh_token, access: tok.access_token, accessUntil: Date.now() + tok.expires_in * 1000 });
  await save();
  return g.access!;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

function steamGame(appid: number, name: string, stats?: ScannedGame['stats']): ScannedGame {
  return {
    id: `steam:${appid}`,
    source: 'steam',
    sourceGameId: String(appid),
    title: name,
    launch: { kind: 'url', target: `steam://rungameid/${appid}` },
    install: { kind: 'url', target: `steam://install/${appid}` },
    art: { cover: `${STEAM_CDN}/${appid}/library_600x900_2x.jpg`, hero: `${STEAM_CDN}/${appid}/library_hero.jpg`, logo: `${STEAM_CDN}/${appid}/logo.png`, icon: `${STEAM_CDN}/${appid}/header.jpg` },
    stats
  };
}

async function steamGames(s: Stored): Promise<ScannedGame[]> {
  const ses = session.fromPartition(partitionFor('steam'));
  const steamId = s.steam!.steamId;
  // 1) Best: the same owned-games list the Steam client uses, with names and play time.
  //    The signed-in store session hands out a short-lived Web API token for this.
  try {
    const cfg: any = await (await ses.fetch('https://store.steampowered.com/pointssummary/ajaxgetasyncconfig', { headers: { 'User-Agent': UA } })).json();
    const token = cfg?.data?.webapi_token;
    if (token) {
      const r = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?access_token=${encodeURIComponent(token)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`);
      const j: any = r.ok ? await r.json() : null;
      const games: any[] = j?.response?.games ?? [];
      if (games.length) {
        return games.map((g) => steamGame(g.appid, g.name ?? `App ${g.appid}`, { minutes: g.playtime_forever || 0, lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : undefined }));
      }
    }
  } catch {}
  // 2) Fallback: everything the account owns, keeping only real games (no DLC, soundtracks or tools).
  const r = await ses.fetch('https://store.steampowered.com/dynamicstore/userdata/', { headers: { 'User-Agent': UA } });
  const j: any = await r.json().catch(() => ({}));
  const owned: number[] = j?.rgOwnedApps ?? [];
  if (!owned.length) throw new Error('Steam sign-in expired. Sign in again.');
  const items = await steamItems(owned);
  return owned
    .map((id) => items.get(id))
    .filter((it): it is NonNullable<typeof it> => !!it && it.type === 0 && !!it.name)
    .map((it) => ({ ...steamGame(it.appid, it.name!), art: { ...steamGame(it.appid, '').art, ...Object.fromEntries(Object.entries(it.art).filter(([, v]) => v)) } }));
}

async function epicGames(s: Stored): Promise<ScannedGame[]> {
  const token = await epicAccess(s);
  const auth = { Authorization: `Bearer ${token}` };
  const records: any[] = [];
  let cursor = '';
  for (let page = 0; page < 50; page++) {
    const r = await fetch(`https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: auth });
    if (!r.ok) throw new Error(`Epic library returned ${r.status}`);
    const j: any = await r.json();
    records.push(...(j.records ?? []));
    cursor = j.responseMetadata?.nextCursor;
    if (!cursor) break;
  }
  const usable = records.filter((x) => x.namespace && x.namespace !== 'ue' && x.catalogItemId && x.appName && x.sandboxType !== 'PRIVATE');
  const byNs = new Map<string, any[]>();
  for (const rec of usable) byNs.set(rec.namespace, [...(byNs.get(rec.namespace) ?? []), rec]);
  const items = new Map<string, any>();
  await pool([...byNs.entries()], 6, async ([ns, recs]) => {
    const ids = [...new Set(recs.map((x) => x.catalogItemId))].join(',');
    try {
      const r = await fetch(`https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${ns}/bulk/items?id=${ids}&includeDLCDetails=true&includeMainGameDetails=true&country=US&locale=en`, { headers: auth });
      const j: any = await r.json();
      for (const [k, v] of Object.entries(j ?? {})) items.set(k, v);
    } catch {}
  });
  const playtime = new Map<string, number>();
  try {
    const r = await fetch(`https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/${s.epic!.accountId}/all`, { headers: auth });
    for (const p of r.ok ? ((await r.json()) as any[]) : []) playtime.set(p.artifactId, Math.round((p.totalTime ?? 0) / 60));
  } catch {}
  const out: ScannedGame[] = [];
  const seen = new Set<string>();
  for (const rec of usable) {
    const it = items.get(rec.catalogItemId);
    if (!it || seen.has(rec.appName)) continue;
    const cats: string[] = (it.categories ?? []).map((c: any) => String(c.path).toLowerCase());
    if (it.mainGameItem || cats.some((c) => c.startsWith('addons') || c === 'digitalextras' || c === 'plugins')) continue;
    if (cats.length && !cats.includes('games') && !cats.includes('applications')) continue;
    seen.add(rec.appName);
    const img = (t: string) => it.keyImages?.find((k: any) => k.type === t)?.url;
    const lid = `${rec.namespace}%3A${rec.catalogItemId}%3A${rec.appName}`;
    out.push({
      id: `epic:${rec.appName}`,
      source: 'epic',
      sourceGameId: rec.appName,
      title: it.title,
      launch: { kind: 'url', target: `com.epicgames.launcher://apps/${lid}?action=launch&silent=true` },
      install: { kind: 'url', target: `com.epicgames.launcher://apps/${lid}?action=install` },
      art: { cover: img('DieselGameBoxTall') ?? img('OfferImageTall'), hero: img('DieselGameBox') ?? img('OfferImageWide'), logo: img('DieselGameBoxLogo') },
      stats: playtime.has(rec.appName) ? { minutes: playtime.get(rec.appName) } : undefined
    });
  }
  return out;
}

async function gogGames(s: Stored): Promise<ScannedGame[]> {
  const token = await gogAccess(s);
  const out: ScannedGame[] = [];
  for (let page = 1, total = 1; page <= total && page <= 100; page++) {
    const r = await fetch(`https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`GOG library returned ${r.status}`);
    const j: any = await r.json();
    total = j.totalPages ?? 1;
    for (const p of j.products ?? []) {
      if (p.isGame === false) continue;
      const id = String(p.id);
      const img = p.image ? `https:${p.image}` : undefined;
      out.push({
        id: `gog:${id}`,
        source: 'gog',
        sourceGameId: id,
        title: p.title,
        launch: { kind: 'url', target: `goggalaxy://openGameView/${id}` },
        install: { kind: 'url', target: `goggalaxy://openGameView/${id}` },
        art: img ? { hero: `${img}.jpg`, icon: `${img}_196.jpg` } : {}
      });
    }
  }
  return out;
}

/** Owned games from every signed-in account. Errors are stored per account and shown in Settings. */
export async function accountGames(): Promise<{ games: ScannedGame[]; reports: { source: AccountId; owned: number; error?: string }[] }> {
  const s = await load();
  const jobs: [AccountId, (s: Stored) => Promise<ScannedGame[]>][] = [];
  if (s.steam) jobs.push(['steam', steamGames]);
  if (s.epic) jobs.push(['epic', epicGames]);
  if (s.gog) jobs.push(['gog', gogGames]);
  for (const id of MORE_IDS) if (s.more?.[id]) jobs.push([id, (st) => PROVIDERS[id].games(st.more![id]!)]);
  const results = await Promise.all(jobs.map(async ([id, fn]) => {
    try {
      return { id, games: await fn(s) };
    } catch (e: any) {
      return { id, games: [] as ScannedGame[], error: String(e?.message ?? e) };
    }
  }));
  s.counts ??= {};
  s.errors ??= {};
  for (const r of results) {
    if (r.error) s.errors[r.id] = r.error;
    else {
      delete s.errors[r.id];
      s.counts[r.id] = r.games.length;
    }
  }
  await save();
  return { games: results.flatMap((r) => r.games), reports: results.map((r) => ({ source: r.id, owned: r.games.length, error: r.error })) };
}
