// Sign-in for the launchers that have no official "read my library" API for other apps:
// Xbox, Battle.net, Amazon Games, EA and Ubisoft. These use the same web sign-in pages and
// endpoints the launchers' own apps and websites use (the approach open-source launchers such
// as Playnite, Heroic and Nile take). They can stop working when a launcher changes its site,
// so every one fails softly with a message in Settings.
import { BrowserWindow, session } from 'electron';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ScannedGame } from '../shared/types';

export type MoreId = 'xbox' | 'battlenet' | 'amazon' | 'ea' | 'ubisoft';
export const MORE_IDS: MoreId[] = ['xbox', 'battlenet', 'amazon', 'ea', 'ubisoft'];

export interface Provider {
  /** Runs the sign-in in `open`'s window and returns what to remember (tokens, name). */
  signIn(open: (url: string, title: string) => BrowserWindow): Promise<Record<string, any>>;
  /** Lists the account's games. May update `data` (refreshed tokens); the caller saves it. */
  games(data: Record<string, any>): Promise<ScannedGame[]>;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const part = (id: MoreId) => session.fromPartition(`persist:acct-${id}`);
const closed = (w: BrowserWindow, reject: (e: Error) => void) => w.on('closed', () => reject(new Error('Sign-in window closed')));

/** Resolves with the first visited URL that `pick` accepts. */
function waitForUrl<T>(w: BrowserWindow, pick: (url: string) => T | undefined): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const look = (_e: unknown, u: string) => {
      const v = pick(u);
      if (v !== undefined) resolve(v);
    };
    w.webContents.on('will-redirect', look);
    w.webContents.on('will-navigate', look);
    w.webContents.on('did-navigate', look);
    w.webContents.on('did-navigate-in-page', look);
    closed(w, reject);
  });
}

async function json(r: Response, what: string): Promise<any> {
  if (!r.ok) throw new Error(`${what} returned ${r.status}`);
  return r.json();
}

// ---------- Xbox ----------
const XBOX_CLIENT = '38cd2fa8-66fd-4760-afb2-405eb65d5b0c';
const XBOX_REDIRECT = 'https://login.live.com/oauth20_desktop.srf';
const XBOX_SCOPE = 'Xboxlive.signin Xboxlive.offline_access';

async function xboxToken(params: Record<string, string>) {
  const body = new URLSearchParams({ client_id: XBOX_CLIENT, scope: XBOX_SCOPE, redirect_uri: XBOX_REDIRECT, ...params });
  return json(await fetch('https://login.live.com/oauth20_token.srf', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }), 'Microsoft sign-in');
}

async function xboxLive(accessToken: string): Promise<{ header: string; xuid: string; gamertag?: string }> {
  const post = async (url: string, body: any) =>
    json(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-xbl-contract-version': '1' }, body: JSON.stringify(body) }), 'Xbox Live');
  const user = await post('https://user.auth.xboxlive.com/user/authenticate', {
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${accessToken}` }
  });
  const xsts = await post('https://xsts.auth.xboxlive.com/xsts/authorize', {
    RelyingParty: 'http://xboxlive.com', TokenType: 'JWT', Properties: { UserTokens: [user.Token], SandboxId: 'RETAIL' }
  });
  const xui = xsts.DisplayClaims?.xui?.[0] ?? {};
  return { header: `XBL3.0 x=${xui.uhs};${xsts.Token}`, xuid: xui.xid, gamertag: xui.gtg };
}

const xbox: Provider = {
  async signIn(open) {
    const url = `https://login.live.com/oauth20_authorize.srf?client_id=${XBOX_CLIENT}&response_type=code&approval_prompt=auto&scope=${encodeURIComponent(XBOX_SCOPE)}&redirect_uri=${encodeURIComponent(XBOX_REDIRECT)}`;
    const w = open(url, 'Sign in to Xbox');
    const code = await waitForUrl(w, (u) => (u.startsWith(XBOX_REDIRECT) ? new URL(u).searchParams.get('code') ?? undefined : undefined));
    w.destroy();
    const tok = await xboxToken({ grant_type: 'authorization_code', code });
    const live = await xboxLive(tok.access_token);
    return { refresh: tok.refresh_token, name: live.gamertag };
  },
  async games(d) {
    const tok = await xboxToken({ grant_type: 'refresh_token', refresh_token: d.refresh });
    d.refresh = tok.refresh_token ?? d.refresh;
    const live = await xboxLive(tok.access_token);
    d.name = live.gamertag ?? d.name;
    const r = await fetch(`https://titlehub.xboxlive.com/users/xuid(${live.xuid})/titles/titlehistory/decoration/detail,image`, {
      headers: { Authorization: live.header, 'x-xbl-contract-version': '2', 'Accept-Language': 'en-US', Accept: 'application/json' }
    });
    const j = await json(r, 'Xbox game list');
    return (j.titles ?? [])
      .filter((t: any) => t.type === 'Game' && t.pfn && (t.devices ?? []).some((x: string) => x === 'PC' || x === 'Win32'))
      .map((t: any): ScannedGame => ({
        id: `xbox:${t.pfn}`,
        source: 'xbox',
        sourceGameId: t.pfn,
        title: t.name,
        launch: { kind: 'url', target: `ms-windows-store://pdp/?PFN=${t.pfn}` },
        install: { kind: 'url', target: `ms-windows-store://pdp/?PFN=${t.pfn}` },
        art: { icon: t.displayImage || undefined },
        stats: t.titleHistory?.lastTimePlayed ? { lastPlayed: Date.parse(t.titleHistory.lastTimePlayed) || undefined } : undefined
      }));
  }
};

// ---------- Battle.net ----------
const battlenet: Provider = {
  async signIn(open) {
    const w = open('https://account.battle.net/', 'Sign in to Battle.net');
    // Signed in once the account site itself is showing (not the login host or a login path).
    await waitForUrl(w, (u) => {
      const x = new URL(u);
      return x.host === 'account.battle.net' && !/login|challenge|oauth/i.test(x.pathname) ? true : undefined;
    });
    await new Promise((r) => setTimeout(r, 1500));
    let name: string | undefined;
    try {
      const me = await (await part('battlenet').fetch('https://account.battle.net/api/overview', { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json();
      name = me?.accountDetails?.battleTag ?? me?.battleTag;
    } catch {}
    w.destroy();
    return { name };
  },
  async games() {
    const get = async (p: string) => {
      const r = await part('battlenet').fetch(`https://account.battle.net/api/${p}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('Battle.net sign-in expired. Sign in again.');
      return r.json() as Promise<any>;
    };
    const main = await get('games-and-subs');
    const classic = await get('classic-games').catch(() => ({}));
    const out = new Map<string, ScannedGame>();
    const add = (key: string, title: string) => {
      if (!title || out.has(title)) return;
      out.set(title, {
        id: `battlenet:acct-${key}`,
        source: 'battlenet',
        sourceGameId: `acct-${key}`,
        title,
        launch: { kind: 'url', target: 'battlenet://' },
        install: { kind: 'url', target: 'battlenet://' },
        art: {}
      });
    };
    for (const g of main.gameAccounts ?? []) add(String(g.titleId ?? g.localizedGameName), g.localizedGameName);
    for (const g of classic.classicGames ?? []) add(String(g.regionalGameFranchiseIconFilename ?? g.localizedGameName), g.localizedGameName);
    return [...out.values()];
  }
};

// ---------- Amazon Games ----------
const AMZ_DEVICE = 'A2UMVHOX7UP4V7';
const AMZ_APP = { app_name: 'AGSLauncher for Windows', app_version: '1.0.0' };

const amazon: Provider = {
  async signIn(open) {
    const serial = randomUUID().replace(/-/g, '').toUpperCase();
    const clientId = Buffer.from(`${serial}#${AMZ_DEVICE}`, 'utf8').toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const q = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.mode': 'checkid_setup',
      'openid.oa2.scope': 'device_auth_access',
      'openid.ns.oa2': 'http://www.amazon.com/ap/ext/oauth/2',
      'openid.oa2.response_type': 'code',
      'openid.oa2.code_challenge_method': 'S256',
      'openid.oa2.client_id': `device:${clientId}`,
      language: 'en_US',
      marketPlaceId: 'ATVPDKIKX0DER',
      'openid.return_to': 'https://www.amazon.com',
      'openid.pape.max_auth_age': '0',
      'openid.assoc_handle': 'amzn_sonic_games_launcher',
      pageId: 'amzn_sonic_games_launcher',
      'openid.oa2.code_challenge': challenge
    });
    const w = open(`https://www.amazon.com/ap/signin?${q}`, 'Sign in to Amazon Games');
    const code = await waitForUrl(w, (u) => new URL(u).searchParams.get('openid.oa2.authorization_code') ?? undefined);
    w.destroy();
    const r = await fetch('https://api.amazon.com/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AGSLauncher/1.0.0' },
      body: JSON.stringify({
        auth_data: { authorization_code: code, client_domain: 'DeviceLegacy', client_id: clientId, code_algorithm: 'SHA-256', code_verifier: verifier, use_global_authentication: false },
        registration_data: { ...AMZ_APP, device_model: 'Windows', device_name: null, device_serial: serial, device_type: AMZ_DEVICE, domain: 'Device', os_version: '10.0.19044.0' },
        requested_extensions: ['customer_info', 'device_info'],
        requested_token_type: ['bearer', 'mac_dms'],
        user_context_map: {}
      })
    });
    const j = await json(r, 'Amazon sign-in');
    const s = j.response?.success;
    if (!s?.tokens?.bearer?.refresh_token) throw new Error('Amazon did not return a sign-in token');
    return { serial, refresh: s.tokens.bearer.refresh_token, name: s.extensions?.customer_info?.given_name ?? s.extensions?.customer_info?.name };
  },
  async games(d) {
    const t = await json(await fetch('https://api.amazon.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AGSLauncher/1.0.0' },
      body: JSON.stringify({ source_token: d.refresh, source_token_type: 'refresh_token', requested_token_type: 'access_token', ...AMZ_APP })
    }), 'Amazon sign-in');
    const hardwareHash = createHash('sha256').update(d.serial).digest('hex').toUpperCase();
    const out: ScannedGame[] = [];
    let nextToken: string | null = null;
    for (let page = 0; page < 40; page++) {
      const r: Response = await fetch('https://gaming.amazon.com/api/distribution/entitlements', {
        method: 'POST',
        headers: {
          'X-Amz-Target': 'com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements',
          'x-amzn-token': t.access_token,
          'User-Agent': 'com.amazon.agslauncher.win/3.0.9202.1',
          'Content-Type': 'application/json',
          'Content-Encoding': 'amz-1.0'
        },
        body: JSON.stringify({ Operation: 'GetEntitlements', clientId: 'Sonic', syncPoint: null, nextToken, maxResults: 50, productIdFilter: null, keyId: 'd5dc8b8b-86c8-4fc4-ae93-18c0def5314d', hardwareHash })
      });
      const j = await json(r, 'Amazon game list');
      for (const e of j.entitlements ?? []) {
        const p = e.product ?? {};
        if (!p.id || !p.title) continue;
        const det = p.productDetail?.details ?? {};
        out.push({
          id: `amazon:${p.id}`,
          source: 'amazon',
          sourceGameId: p.id,
          title: p.title,
          launch: { kind: 'url', target: `amazon-games://play/${p.id}` },
          install: { kind: 'url', target: `amazon-games://play/${p.id}` },
          art: { cover: p.productDetail?.iconUrl || undefined, hero: det.backgroundUrl1 || det.backgroundUrl2 || undefined, logo: det.logoUrl || undefined }
        });
      }
      nextToken = j.nextToken ?? null;
      if (!nextToken) break;
    }
    return out;
  }
};

// ---------- EA ----------
const ea: Provider = {
  async signIn(open) {
    const w = open('https://www.ea.com/login', 'Sign in to EA');
    // Poll for a token: it only comes back once the EA account cookies exist.
    const token = await new Promise<string>((resolve, reject) => {
      const t = setInterval(async () => {
        const tok = await eaToken().catch(() => undefined);
        if (tok) { clearInterval(t); resolve(tok); }
      }, 2500);
      w.on('closed', () => { clearInterval(t); reject(new Error('Sign-in window closed')); });
    });
    w.destroy();
    let name: string | undefined;
    try {
      const me = await (await fetch('https://gateway.ea.com/proxy/identity/pids/me', { headers: { Authorization: `Bearer ${token}` } })).json();
      name = me?.pid?.email ? String(me.pid.email).replace(/(.{2}).*(@.*)/, '$1…$2') : undefined;
    } catch {}
    return { name };
  },
  async games() {
    const token = await eaToken();
    if (!token) throw new Error('EA sign-in expired. Sign in again.');
    const query = `query { me { ownedGameProducts(locale: "en", entitlementEnabled: true, storefronts: [EA], type: [DIGITAL_FULL_GAME, PACKAGED_FULL_GAME], platforms: [PC], paging: { limit: 9999 }) { items { originOfferId product { id name gameSlug baseItem { gameType } } } } } }`;
    const r = await fetch(`https://service-aggregation-layer.juno.ea.com/graphql?query=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' } });
    const j = await json(r, 'EA game list');
    if (j.errors?.length && !j.data) throw new Error(j.errors[0].message ?? 'EA game list failed');
    const seen = new Set<string>();
    const out: ScannedGame[] = [];
    for (const it of j.data?.me?.ownedGameProducts?.items ?? []) {
      const p = it.product ?? {};
      const type = p.baseItem?.gameType;
      if (!p.name || seen.has(p.name) || (type && type !== 'BASE_GAME')) continue;
      seen.add(p.name);
      const key = p.gameSlug || p.id || it.originOfferId;
      out.push({
        id: `ea:acct-${key}`,
        source: 'ea',
        sourceGameId: `acct-${key}`,
        title: p.name,
        launch: { kind: 'url', target: it.originOfferId ? `origin2://game/launch?offerIds=${it.originOfferId}&autoDownload=1` : 'origin2://library/open' },
        install: { kind: 'url', target: it.originOfferId ? `origin2://game/launch?offerIds=${it.originOfferId}&autoDownload=1` : 'origin2://library/open' },
        art: {}
      });
    }
    return out;
  }
};

async function eaToken(): Promise<string | undefined> {
  const r = await part('ea').fetch('https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none', { headers: { 'User-Agent': UA } });
  const j: any = await r.json().catch(() => ({}));
  return j?.access_token || undefined;
}

// ---------- Ubisoft ----------
const UBI_APP = 'f35adcb5-1911-440c-b1c9-48fdc1701c68';

async function ubiPlayed(d: Record<string, any>, headers: Record<string, string>): Promise<any[]> {
  const r = await fetch(`https://public-ubiservices.ubi.com/v1/profiles/${d.userId}/gamesplayed`, { headers });
  if (!r.ok) throw new Error(`games played ${r.status}`);
  const played: any[] = ((await r.json()) as any).gamesPlayed ?? [];
  const pc = played.filter((g) => !g.platformType || /^(PC|UPLAY)$/i.test(g.platformType));
  const ids = [...new Set(pc.map((g) => g.spaceId).filter(Boolean))];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const rs = await fetch(`https://public-ubiservices.ubi.com/v1/spaces?spaceIds=${ids.slice(i, i + 40).join(',')}`, { headers });
    if (!rs.ok) throw new Error(`game names ${rs.status}`);
    for (const sp of ((await rs.json()) as any).spaces ?? []) out.push({ id: sp.spaceId, spaceId: sp.spaceId, name: sp.spaceName ?? sp.name });
  }
  return out;
}

const ubisoft: Provider = {
  async signIn(open) {
    const w = open(`https://connect.ubisoft.com/login?appId=${UBI_APP}&lang=en-US&nextUrl=${encodeURIComponent('https://connect.ubisoft.com/ready')}`, 'Sign in to Ubisoft');
    // The Ubisoft site keeps its session ticket in the page's local storage after login.
    const read = `(() => { for (const k of Object.keys(localStorage)) { try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.ticket && v.sessionId) return JSON.stringify({ ticket: v.ticket, sessionId: v.sessionId, userId: v.userId, name: v.nameOnPlatform || v.username, rememberMeTicket: v.rememberMeTicket }); } catch {} } return ''; })()`;
    const data = await new Promise<any>((resolve, reject) => {
      const t = setInterval(async () => {
        if (w.isDestroyed()) return;
        const s = await w.webContents.executeJavaScript(read).catch(() => '');
        if (s) { clearInterval(t); resolve(JSON.parse(s)); }
      }, 1500);
      w.on('closed', () => { clearInterval(t); reject(new Error('Sign-in window closed')); });
    });
    w.destroy();
    return data;
  },
  async games(d) {
    // Renew the session with the "remember me" ticket when there is one.
    if (d.rememberMeTicket) {
      try {
        const r = await fetch('https://public-ubiservices.ubi.com/v3/profiles/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Ubi-AppId': UBI_APP, Authorization: `rm_v1 t=${d.rememberMeTicket}`, 'User-Agent': UA },
          body: JSON.stringify({ rememberMe: true })
        });
        if (r.ok) {
          const j: any = await r.json();
          Object.assign(d, { ticket: j.ticket, sessionId: j.sessionId, rememberMeTicket: j.rememberMeTicket ?? d.rememberMeTicket, name: j.nameOnPlatform ?? d.name });
        }
      } catch {}
    }
    const headers = {
      'Content-Type': 'application/json', 'Ubi-AppId': UBI_APP, 'Ubi-SessionId': d.sessionId, Authorization: `Ubi_v1 t=${d.ticket}`,
      'Ubi-LocaleCode': 'en-US', 'Ubi-RequestedPlatformType': 'uplay', 'User-Agent': UA
    };
    // Ubisoft doesn't document this service, so try the richest question first and fall back to simpler ones.
    const fields = ['id spaceId name coverUrl bannerUrl platform { type }', 'id spaceId name coverUrl platform { type }', 'id spaceId name platform { type }', 'id spaceId name'];
    let nodes: any[] | undefined;
    let lastErr = '';
    for (const f of fields) {
      for (const query of [
        `query AllGames { viewer { id games(filterBy: { isOwned: true }) { totalCount nodes { ${f} } } } }`,
        `query AllGames { viewer { id games { totalCount nodes { ${f} } } } }`
      ]) {
        const r = await fetch('https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql', { method: 'POST', headers, body: JSON.stringify({ operationName: 'AllGames', variables: {}, query }) });
        if (r.status === 401) throw new Error('Ubisoft sign-in expired. Sign in again.');
        const text = await r.text();
        let j: any;
        try { j = JSON.parse(text); } catch { j = undefined; }
        const got = j?.data?.viewer?.games?.nodes;
        if (Array.isArray(got)) { nodes = got; break; }
        lastErr = `${r.status} ${String(j?.errors?.[0]?.message ?? j?.message ?? text).slice(0, 140)}`;
      }
      if (nodes) break;
    }
    // Second route: the plain "games played" list plus a name lookup.
    if (!nodes && d.userId) nodes = await ubiPlayed(d, headers).catch((e) => { lastErr += ` | ${String(e?.message ?? e).slice(0, 80)}`; return undefined; });
    if (!nodes) throw new Error(`Ubisoft game list failed: ${lastErr}`);
    const j = { data: { viewer: { games: { nodes } } } };
    const seen = new Set<string>();
    const out: ScannedGame[] = [];
    for (const n of j.data?.viewer?.games?.nodes ?? []) {
      if (!n.name || seen.has(n.name) || (n.platform?.type && /PS\d|XBOX|XONE|XBL|SWITCH|WIIU|STADIA|LUNA|ANDROID|IOS/i.test(n.platform.type))) continue;
      seen.add(n.name);
      out.push({
        id: `ubisoft:acct-${n.spaceId ?? n.id}`,
        source: 'ubisoft',
        sourceGameId: `acct-${n.spaceId ?? n.id}`,
        title: n.name,
        launch: { kind: 'url', target: 'uplay://' },
        install: { kind: 'url', target: 'uplay://' },
        art: { cover: n.coverUrl || undefined, hero: n.bannerUrl || undefined }
      });
    }
    return out;
  }
};

export const PROVIDERS: Record<MoreId, Provider> = { xbox, battlenet, amazon, ea, ubisoft };
