import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DealItem, DealSection, GameInfo, LookupResult } from '../../shared/types';
import { Icon } from '../components/Icon';
import { api, isDesktop } from '../lib/api';
import { titleOf } from '../lib/library';
import { normTitle } from '../lib/norm';
import { useLumen } from '../lib/store';

export const WEB_TABS = [
  { id: 'steamdb', label: 'SteamDB', url: 'https://steamdb.info/' },
  { id: 'steam', label: 'Steam store', url: 'https://store.steampowered.com/' },
  { id: 'epic', label: 'Epic store', url: 'https://store.epicgames.com/' },
  { id: 'ggdeals', label: 'GG.deals', url: 'https://gg.deals/deals/pc/' }
] as const;

/** A browser tab inside Lumen. Pages run in their own sandboxed process with their own cookies. */
// Lumen's built-in page view is a little behind the newest Chrome, and some sites (SteamDB) show an
// "unsupported browser" banner for that. Reporting a current version avoids the banner.
export const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

export function WebTab({ url }: { url: string }) {
  const ref = useRef<any>(null);
  const [cur, setCur] = useState(url);
  const [loading, setLoading] = useState(true);
  const ready = useRef(false);
  const [can, setCan] = useState({ back: false, fwd: false });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('toolbar-slot')), []);
  // Webview methods throw until its page is attached, so only steer it once it's ready.
  useEffect(() => {
    setCur(url);
    if (ready.current) ref.current?.loadURL(url).catch?.(() => undefined);
  }, [url]);
  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    const nav = (e: any) => { setCur(e.url); try { setCan({ back: wv.canGoBack(), fwd: wv.canGoForward() }); } catch { /* not attached yet */ } };
    const start = () => setLoading(true);
    const stop = () => setLoading(false);
    const onReady = () => {
      ready.current = true;
      // Slim dark scrollbars so the page edge matches the rest of Lumen.
      wv.insertCSS('::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(140,140,150,.45);border-radius:10px;border:2px solid transparent;background-clip:content-box}').catch?.(() => undefined);
    };
    wv.addEventListener('dom-ready', onReady);
    wv.addEventListener('did-navigate', nav);
    wv.addEventListener('did-navigate-in-page', nav);
    wv.addEventListener('did-start-loading', start);
    wv.addEventListener('did-stop-loading', stop);
    return () => {
      wv.removeEventListener('dom-ready', onReady);
      wv.removeEventListener('did-navigate', nav);
      wv.removeEventListener('did-navigate-in-page', nav);
      wv.removeEventListener('did-start-loading', start);
      wv.removeEventListener('did-stop-loading', stop);
    };
  }, []);
  if (!isDesktop) {
    return (
      <div className="empty">
        <h3>The browser tab works in the Windows app</h3>
        <p>In the app this shows <b>{url}</b> right here, with back, forward and reload.</p>
        <a className="btn primary" href={url} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Open in your browser</a>
      </div>
    );
  }
  return (
    <div className={`webtab ${loading ? 'loading' : ''}`}>
      {/* No address bar: the page's few controls sit in Lumen's own top bar, next to the title. */}
      {slot && createPortal(
        <div className="webnav">
          <button className="icon-btn ghost" title="Back" disabled={!can.back} onClick={() => ready.current && ref.current?.canGoBack() && ref.current.goBack()}><Icon name="chevronLeft" /></button>
          <button className="icon-btn ghost" title="Forward" disabled={!can.fwd} onClick={() => ready.current && ref.current?.canGoForward() && ref.current.goForward()}><Icon name="chevron" /></button>
          <button className="icon-btn ghost" title="Reload" onClick={() => ready.current && ref.current?.reload()}><Icon name="refresh" className={loading ? 'spin' : ''} /></button>
          <button className="icon-btn ghost" title="Back to the start page" onClick={() => ready.current && ref.current?.loadURL(url)}><Icon name="home" /></button>
          <a className="icon-btn ghost" title="Open this page in your browser" href={cur} target="_blank" rel="noreferrer"><Icon name="external" /></a>
        </div>, slot)}
      <div className="webload" />
      {createElement('webview', { ref, src: url, partition: 'persist:web', allowpopups: 'true', class: 'webview', useragent: WEB_UA })}
    </div>
  );
}

function DealCard({ d, owned, onClick }: { d: DealItem; owned: boolean; onClick(): void }) {
  return (
    <button className={`deal ${d.store}`} onClick={onClick} title={d.title}>
      <div className="deal-img">
        {d.image ? <img src={d.image} alt="" loading="lazy" /> : <div className="fallback" style={{ ['--h' as any]: 210 }}><span className="fb-title">{d.title}</span></div>}
        {d.discount ? <span className="deal-off">-{d.discount}%</span> : null}
        {d.free && <span className="deal-off free">{d.upcoming ? 'Free soon' : 'Free'}</span>}
        {owned && <span className="deal-owned">In library</span>}
      </div>
      <div className="deal-info">
        <b>{d.title}</b>
        <span className="deal-price">
          {d.originalPrice && <s>{d.originalPrice}</s>} <em>{d.price ?? ''}</em>
          <small>{d.store === 'steam' ? 'Steam' : 'Epic'}{d.endsAt && timeLeft(d.endsAt) ? ` · ${d.upcoming ? 'starts in' : 'ends in'} ${timeLeft(d.endsAt)}` : ''}</small>
        </span>
      </div>
    </button>
  );
}

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

/** A random handful of everything on sale or free right now, across Steam and Epic. */
function RandomDeals({ owned, onSteam, onOpen }: { owned: Set<string>; onSteam(appid: number): void; onOpen(url: string): void }) {
  const [pool, setPool] = useState<DealItem[] | null>(null);
  const [pick, setPick] = useState<DealItem[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async (refresh = false) => {
    setBusy(true);
    try {
      const secs = await api.deals(refresh);
      const seen = new Set<string>();
      const all = secs.flatMap((s) => s.items).filter((d) => (d.discount || d.free) && !d.upcoming && !seen.has(d.id) && seen.add(d.id));
      setPool(all);
      setPick(shuffle(all).slice(0, 12));
    } catch { setPool([]); } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h3>Random deals right now</h3>
        {pool && pool.length > 0 && <span className="muted">{pick.length} of {pool.length} on sale or free</span>}
        <div className="spacer" />
        <button className="btn" onClick={() => (pool?.length ? setPick(shuffle(pool).slice(0, 12)) : load(true))} disabled={busy}>
          <Icon name="refresh" size={16} className={busy ? 'spin' : ''} /> Shuffle
        </button>
      </div>
      {!pool ? <p className="muted">Loading deals…</p> : pool.length === 0 ? <p className="muted">Couldn't load deals right now. Try Shuffle in a minute.</p> : (
        <div className="deal-grid">
          {pick.map((d) => {
            const sid = d.store === 'steam' ? Number(/^steam:(\d+)$/.exec(d.id)?.[1]) : NaN;
            return <DealCard key={d.id} d={d} owned={owned.has(normTitle(d.title))} onClick={() => (sid ? onSteam(sid) : onOpen(d.url))} />;
          })}
        </div>
      )}
    </section>
  );
}

function timeLeft(iso?: string) {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return '';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function Deals({ onOpen }: { onOpen(url: string): void }) {
  const { library } = useLumen();
  const [data, setData] = useState<DealSection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [store, setStore] = useState<'all' | 'steam' | 'epic'>('all');
  const owned = useMemo(() => new Set(library.games.map((g) => normTitle(titleOf(g)))), [library.games]);
  const load = async (refresh = false) => {
    setBusy(true);
    try { setData(await api.deals(refresh)); } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const card = (d: DealItem) => <DealCard key={d.id} d={d} owned={owned.has(normTitle(d.title))} onClick={() => onOpen(d.url)} />;

  return (
    <div className="deals">
      <div className="deals-bar">
        <div className="segmented">
          {(['all', 'steam', 'epic'] as const).map((s) => <button key={s} className={store === s ? 'on' : ''} onClick={() => setStore(s)}>{s === 'all' ? 'All stores' : s === 'steam' ? 'Steam' : 'Epic'}</button>)}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => load(true)} disabled={busy}><Icon name="refresh" size={16} className={busy ? 'spin' : ''} /> Refresh</button>
      </div>
      {!data && <p className="muted">Loading deals…</p>}
      {data?.filter((s) => store === 'all' || s.store === store).map((s) => (
        <section key={s.id} className="shelf">
          <div className="shelf-head"><h3>{s.title}</h3>{s.items.length > 0 && <span className="muted">{s.items.length}</span>}
            {s.id === 'steam-trending' && <button className="link" onClick={() => onOpen('https://steamdb.info/charts/')}>More charts on SteamDB <Icon name="chevron" size={14} /></button>}
          </div>
          {s.error ? <p className="muted">Couldn't load this list right now ({s.error}). Try Refresh in a few minutes.</p>
            : s.items.length === 0 ? <p className="muted">Nothing here right now.</p>
            : <div className="deal-row">{s.items.map(card)}</div>}
        </section>
      ))}
      <p className="hint">Trending and most played come from Steam's own public charts. Prices come from each store's public storefront for your region. Click a game to open its store page here in Lumen.</p>
    </div>
  );
}

const fmtNum = (n?: number) => (n == null ? '' : n.toLocaleString());

/** Price, reviews and players online for a Steam app. */
export function StoreFacts({ info }: { info: GameInfo }) {
  const r = info.reviews;
  if (!info.price && !r && info.currentPlayers == null && !info.platforms?.length) return null;
  const tone = r?.percent == null ? '' : r.percent >= 80 ? 'good' : r.percent >= 50 ? 'mixed' : 'bad';
  return (
    <div className="facts">
      {info.price && (
        <div><span>Price</span><b>{info.price.initial && <s>{info.price.initial}</s>} {info.price.final}{info.price.discount ? <em className="deal-off inline">-{info.price.discount}%</em> : null}</b></div>
      )}
      {r && <div><span>Reviews</span><b className={`rv ${tone}`}>{r.summary}</b><small>{r.percent}% of {fmtNum(r.total)}</small></div>}
      {info.currentPlayers != null && <div><span>Playing now</span><b>{fmtNum(info.currentPlayers)}</b><small>on Steam</small></div>}
      {info.achievements ? <div><span>Achievements</span><b className="ach-inline"><Icon name="medal" size={15} /> {info.achievements}</b></div> : null}
      {info.dlcCount ? <div><span>DLC</span><b>{info.dlcCount}</b></div> : null}
      {info.platforms?.length ? <div><span>Platforms</span><b>{info.platforms.join(', ')}</b></div> : null}
    </div>
  );
}

const csvCell = (v: unknown) => {
  const t = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** A free Steam store scraper: search any game and see price, reviews, tags and players. Results export to CSV. */
export function Lookup({ onOpen }: { onOpen(url: string): void }) {
  const { library } = useLumen();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LookupResult[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, GameInfo | null>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const owned = useMemo(() => new Set(library.games.map((g) => normTitle(titleOf(g)))), [library.games]);

  const search = async () => {
    if (!q.trim()) return;
    setBusy('Searching…'); setErr(''); setSel(null);
    try { setHits(await api.lookup(q.trim())); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(''); }
  };
  const load = async (id: number) => {
    if (id in details) return details[id];
    const d = await api.lookupDetails(id).catch(() => null);
    setDetails((x) => ({ ...x, [id]: d }));
    return d;
  };
  const open = async (id: number) => { setSel(id); await load(id); };
  const exportCsv = async () => {
    if (!hits?.length) return;
    const rows: string[][] = [];
    for (let i = 0; i < hits.length; i++) {
      setBusy(`Reading ${i + 1} of ${hits.length}…`);
      const h = hits[i];
      const d = await load(h.appid);
      rows.push([
        String(h.appid), d?.name ?? h.name, d?.price?.final ?? h.price ?? '', d?.price?.initial ?? '', d?.price?.discount ? `${d.price.discount}%` : '',
        d?.reviews?.summary ?? '', d?.reviews?.percent != null ? `${d.reviews.percent}%` : '', String(d?.reviews?.total ?? ''), String(d?.currentPlayers ?? ''),
        d?.releaseDate ?? '', (d?.developers ?? []).join('; '), (d?.publishers ?? []).join('; '), (d?.genres ?? []).join('; '), (d?.tags ?? []).join('; '),
        String(d?.metacritic ?? ''), `https://store.steampowered.com/app/${h.appid}/`
      ]);
    }
    setBusy('');
    const head = ['App ID', 'Name', 'Price', 'Full price', 'Discount', 'Reviews', 'Positive', 'Review count', 'Playing now', 'Released', 'Developer', 'Publisher', 'Genres', 'Tags', 'Metacritic', 'Store page'];
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    await api.saveText(`steam-lookup-${q.trim().replace(/[^\w-]+/g, '-').slice(0, 40) || 'results'}.csv`, csv);
  };

  const d = sel != null ? details[sel] : undefined;
  return (
    <div className="lookup">
      <form className="lookup-bar" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <div className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any Steam game by name or App ID" autoFocus /></div>
        <button className="btn primary" disabled={!!busy}>Search</button>
        <div className="spacer" />
        {hits?.length ? <button type="button" className="btn" onClick={exportCsv} disabled={!!busy}><Icon name="download" size={16} /> Export CSV</button> : null}
      </form>
      {busy && <p className="muted">{busy}</p>}
      {err && <p className="error">Couldn't reach Steam ({err}).</p>}
      {hits && hits.length === 0 && <p className="muted">No games found.</p>}
      <div className={`lookup-body ${hits?.length ? '' : 'solo'}`}>
        {hits && hits.length > 0 && (
          <div className="lookup-list">
            {hits.map((h) => (
              <button key={h.appid} className={`lookup-hit ${sel === h.appid ? 'on' : ''}`} onClick={() => open(h.appid)}>
                {h.image ? <img src={h.image} alt="" loading="lazy" /> : <span className="lookup-noimg" />}
                <span className="lookup-name"><b>{h.name}</b><small>{h.price ?? ''}{owned.has(normTitle(h.name)) ? ' · In your library' : ''}</small></span>
              </button>
            ))}
          </div>
        )}
        {sel != null && (
          <div className="lookup-detail">
            <button className="icon-btn ghost lookup-close" title="Close" onClick={() => setSel(null)}><Icon name="close" /></button>
            {d === undefined ? <p className="muted">Loading…</p> : d === null ? <p className="muted">Steam has no store page for this app.</p> : (
              <>
                {d.header && <img className="lookup-header" src={d.header} alt="" />}
                <h2>{d.name}</h2>
                <StoreFacts info={d} />
                {d.description && <p className="about-desc">{d.description}</p>}
                <div className="about-grid">
                  {d.developers?.length ? <div><span>Developer</span><b>{d.developers.join(', ')}</b></div> : null}
                  {d.publishers?.length ? <div><span>Publisher</span><b>{d.publishers.join(', ')}</b></div> : null}
                  {d.releaseDate && <div><span>Released</span><b>{d.releaseDate}</b></div>}
                  {d.metacritic && <div><span>Metacritic</span><b className="score">{d.metacritic}</b></div>}
                </div>
                {d.tags?.length ? <div className="chips">{d.tags.map((x) => <span key={x} className="chip on">{x}</span>)}</div> : null}
                {d.screenshots?.length ? <div className="shots">{d.screenshots.map((u) => <img key={u} src={u} alt="" loading="lazy" />)}</div> : null}
                <div className="row-btns">
                  <button className="btn" onClick={() => onOpen(`https://store.steampowered.com/app/${sel}/`)}><Icon name="external" size={14} /> Steam store</button>
                  <button className="btn" onClick={() => onOpen(`https://steamdb.info/app/${sel}/`)}><Icon name="info" size={14} /> SteamDB</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {sel == null && <RandomDeals owned={owned} onSteam={open} onOpen={onOpen} />}
      {!hits && !busy && <p className="hint">Free and built in: Lumen reads Steam's public store for price, discount, reviews, user tags, players online, release date and more. Export the results as a spreadsheet with Export CSV.</p>}
    </div>
  );
}
