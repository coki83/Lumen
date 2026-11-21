import type { CSSProperties } from 'react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Battery } from '../components/Battery';
import { usePad, usePadInfo, type PadAction } from '../lib/gamepad';
import { useCycle, usePulse } from '../lib/pulse';
import { t } from '../lib/i18n';
import type { AchievementProgress, GameInfo, PulseKind } from '../../shared/types';
import { useCommand } from '../lib/commands';
import { PowerMenu } from '../components/PowerMenu';
import { Wallpaper } from '../components/Wallpaper';
import { playSound } from '../lib/sound';
import type { DesktopLayout, Game, SortKey, SourceId } from '../../shared/types';
import { Cover, FallbackArt, SourceBadge, heroOf } from '../components/Cover';
import { Icon, Logo } from '../components/Icon';
import { Drives, driveCounts } from '../components/Drives';
import { Temps } from '../components/Temps';
import { Modal, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { artOf, lastPlayedOf, minutesOf, mostPlayed, matches, playtime, recentGames, sortGames, timeAgo, titleOf } from '../lib/library';
import { SOURCES, SOURCE_ORDER } from '../lib/sources';
import { downloadLabel, downloadWaiting, useLumen } from '../lib/store';
import { AddGame } from './AddGame';
import { GameEditor } from './GameEditor';
import { SettingsPanel } from './Settings';
import { NAV_ITEMS, ordered } from '../lib/nav';
import { useWeather, weatherIcon } from '../lib/weather';
import { vibes } from '../lib/vibes';
import { Deals, Lookup, StoreFacts, WEB_TABS, WebTab } from './Explore';

type View = { kind: 'home' } | { kind: 'all' } | { kind: 'favorites' } | { kind: 'recent' } | { kind: 'emulation' } | { kind: 'hidden' } | { kind: 'source'; id: SourceId } | { kind: 'category'; name: string } | { kind: 'deals' } | { kind: 'lookup' } | { kind: 'web'; id: string; url: string };

const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

export function Desktop({ onBigScreen }: { onBigScreen(): void }) {
  const { library, settings, saveSettings, scan, scanning, launch, update, uninstall, setCategories } = useLumen();
  const [view, setView] = useState<View>({ kind: 'home' });
  const [typed, setQ] = useState('');
  // The box keeps up with your typing even with thousands of games: the list is allowed to
  // catch up a frame later instead of being rebuilt on every letter.
  const q = useDeferredValue(typed);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  // The game waiting on an "are you sure" before its uninstaller is started.
  const [removing, setRemoving] = useState<string | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [power, setPower] = useState(false);
  const [vibeStep, setVibeStep] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  useCommand((cmd) => {
    if (cmd === 'search') searchRef.current?.focus();
    if (cmd === 'rescan') scan();
    if (cmd === 'settings') setShowSettings(true);
    if (cmd === 'power') setPower(true);
    if (cmd === 'addGame') setAdding(true);
    // Spoken commands land here too.
    if (cmd === 'home') nav({ kind: 'home' });
    if (cmd === 'library') nav({ kind: 'all' });
    if (cmd === 'favorites') nav({ kind: 'favorites' });
  });

  const visible = useMemo(() => library.games.filter((g) => !g.overrides.hidden && (g.installed || settings.showUninstalled || g.source === 'manual')), [library.games, settings.showUninstalled]);
  const notInstalledCount = useMemo(() => library.games.filter((g) => !g.overrides.hidden && !g.installed && g.owned).length, [library.games]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of visible) c[g.source] = (c[g.source] ?? 0) + 1;
    return c;
  }, [visible]);

  const list = useMemo(() => {
    let gs: Game[];
    switch (view.kind) {
      case 'hidden': gs = library.games.filter((g) => g.overrides.hidden); break;
      case 'favorites': gs = visible.filter((g) => g.overrides.favorite); break;
      case 'recent': gs = recentGames(visible, 200); return gs.filter((g) => matches(g, q));
      case 'emulation': gs = visible.filter((g) => g.source === 'quiver'); break;
      case 'source': gs = visible.filter((g) => g.source === view.id); break;
      case 'category': gs = visible.filter((g) => g.overrides.categories?.includes(view.name)); break;
      default: gs = visible;
    }
    return sortGames(gs.filter((g) => matches(g, q)), settings.sort);
  }, [view, library.games, visible, q, settings.sort]);

  const selectedGame = library.games.find((g) => g.id === selected);

  // ---- Keyboard and controller in the desktop view ----
  // Arrows / stick move a highlight between the sidebar and whatever games are on screen, by position:
  // "right" goes to the nearest thing to the right, and so on. Works for shelves, grids, lists and deals.
  const focusEl = useRef<HTMLElement | null>(null);
  const setFocus = (el: HTMLElement | null) => {
    focusEl.current?.classList.remove('focused');
    focusEl.current = el;
    if (!el) return;
    el.classList.add('focused');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: settings.reduceMotion ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const clear = () => setFocus(null); // the mouse takes over
    window.addEventListener('pointerdown', clear);
    return () => window.removeEventListener('pointerdown', clear);
  }, []);
  const focusables = () => [...document.querySelectorAll<HTMLElement>('.sidebar .nav-item, .content .card[data-id], .content .list-row, .content .deal')].filter((e) => e.offsetParent !== null);
  const moveFocus = (dir: 'up' | 'down' | 'left' | 'right') => {
    const all = focusables();
    const cur = focusEl.current && focusEl.current.isConnected ? focusEl.current : null;
    if (!cur) return setFocus(all.find((e) => !e.closest('.sidebar')) ?? all[0] ?? null);
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null, bestScore = Infinity;
    // Up and down stay in the sidebar or in the games; only left and right cross between them.
    const inSide = !!cur.closest('.sidebar');
    const pool = all.filter((e) => !!e.closest('.sidebar') === inSide);
    const cross = all.filter((e) => !!e.closest('.sidebar') !== inSide);
    const search = (list: HTMLElement[]) => {
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      if (along < 4) continue;
      // things lined up with where you are win over closer things that are off to the side
      const overlap = dir === 'left' || dir === 'right' ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const across = Math.abs(dir === 'left' || dir === 'right' ? dy : dx);
      const score = along + across * 3 + (overlap > 0 ? 0 : 600);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    };
    search(pool);
    if (!best && ((dir === 'left' && !inSide) || (dir === 'right' && inSide))) search(cross);
    if (best) { setFocus(best); playSound('move'); }
  };
  const focusedGame = () => { const id = focusEl.current?.isConnected ? focusEl.current.dataset.id : undefined; return id ? library.games.find((g) => g.id === id) : undefined; };
  usePad((a: PadAction) => {
    if (power || showSettings || adding || editing) return; // those windows handle their own input
    if (selectedGame) {
      if (a === 'a' || a === 'x') { playSound('launch'); launch(selectedGame); }
      else if (a === 'y') update(selectedGame.id, { favorite: !selectedGame.overrides.favorite });
      else if (a === 'b') { playSound('back'); setSelected(null); }
      return;
    }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') return moveFocus(a);
    const g = focusedGame();
    if (a === 'a') { if (focusEl.current?.isConnected) { playSound('select'); const el = focusEl.current; el.click(); if (el.closest('.sidebar')) setTimeout(() => { if (el.isConnected) setFocus(el); }, 0); } else moveFocus('right'); }
    else if (a === 'x' && g) { playSound('launch'); launch(g); }
    else if (a === 'y' && g) update(g.id, { favorite: !g.overrides.favorite });
    else if (a === 'b') { if (focusEl.current) setFocus(null); else if (view.kind !== 'home') nav({ kind: 'home' }); }
    else if (a === 'lb' || a === 'rb') {
      const items = [...document.querySelectorAll<HTMLElement>('.sidebar nav .nav-item')];
      const i = items.findIndex((e) => e.classList.contains('on'));
      const next = items[(i + (a === 'rb' ? 1 : items.length - 1)) % items.length];
      setFocus(null);
      next?.click();
      next?.scrollIntoView({ block: 'nearest' });
    } else if (a === 'start') setShowSettings(true);
    else if (a === 'select') setPower(true);
  });
  const bgGame = selectedGame ?? recentGames(visible, 1)[0] ?? visible.find((g) => g.overrides.favorite);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const title =
    view.kind === 'home' ? t('Home') : view.kind === 'all' ? t('All games') : view.kind === 'favorites' ? t('Favorites') : view.kind === 'recent' ? t('Recently played') : view.kind === 'emulation' ? t('Emulation')
      : view.kind === 'hidden' ? 'Hidden' : view.kind === 'source' ? SOURCES[view.id].name : view.kind === 'deals' ? 'Trending & deals' : view.kind === 'lookup' ? 'Game lookup'
      : view.kind === 'web' ? (WEB_TABS.find((t) => t.id === view.id)?.label ?? 'Browser') : view.name;
  const explore = view.kind === 'deals' || view.kind === 'web' || view.kind === 'lookup';

  const nav = (v: View) => {
    playSound('move');
    setView(v);
    setSelected(null);
  };

  const navHidden = settings.navHidden ?? [];
  const customNav = !!settings.navOrder?.length;
  const navIds = ordered(NAV_ITEMS.map((n) => n.id), settings.navOrder).filter((id) => !navHidden.includes(id));
  const weather = useWeather(!!settings.weatherOn, `${settings.weatherCity}|${settings.weatherUnit}`);

  const cardW = Math.round(settings.cardSize * (settings.cardShape === 'landscape' ? 1.6 : settings.cardShape === 'square' ? 1.1 : 1));
  const wrapRows = settings.homeRows === 'wrap';

  const NavItem = ({ v, icon, label, count }: { v: View; icon: string; label: string; count?: number }) => (
    <button className={`nav-item ${sameView(view, v) ? 'on' : ''}`} onClick={() => nav(v)} title={t(label)}>
      <Icon name={icon} />
      <span className="nav-label">{t(label)}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );

  const cardProps = (g: Game) => ({
    g,
    showTitle: settings.showTitles,
    showBadge: settings.showSourceBadges,
    onClick: () => { playSound('select'); setSelected(g.id); },
    onDoubleClick: () => launch(g),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, id: g.id });
    }
  });

  const renderList = (games: Game[], layout: DesktopLayout) => {
    if (!games.length) return <Empty q={q} view={view} onScan={scan} onAdd={() => setAdding(true)} />;
    if (layout === 'list') {
      return (
        <div className="list">
          <div className="list-head"><span /><span>{t('Title')}</span><span>{t('Source')}</span><span>{t('Last played')}</span><span>{t('Playtime')}</span><span /></div>
          {games.map((g) => (
            <div key={g.id} data-id={g.id} className={`list-row ${g.installed ? '' : 'missing'}`} onClick={() => setSelected(g.id)} onDoubleClick={() => launch(g)} onContextMenu={cardProps(g).onContextMenu}>
              <span className="thumb">{artOf(g).icon || artOf(g).cover ? <img src={artOf(g).icon || artOf(g).cover} alt="" /> : <FallbackArt g={g} />}</span>
              <span className="t">{titleOf(g)} {g.overrides.favorite && <span className="star">★</span>}</span>
              <span><SourceBadge source={g.source} /> {SOURCES[g.source].name}</span>
              <span className="muted">{timeAgo(lastPlayedOf(g))}</span>
              <span className="muted">{playtime(minutesOf(g))}</span>
              <span><button className={`btn small ${g.installed ? 'primary' : ''}`} onClick={(e) => { e.stopPropagation(); launch(g); }}>{g.installed ? <><Icon name="play" size={14} fill /> Play</> : 'Install'}</button></span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="grid" style={{ ['--card' as any]: `${cardW}px` }}>
        {games.map((g) => <Cover key={g.id} {...cardProps(g)} />)}
      </div>
    );
  };

  const Shelf = ({ name, games, v }: { name: string; games: Game[]; v?: View }) =>
    games.length ? (
      <section className="shelf">
        <div className="shelf-head">
          <h3>{name}</h3>
          {v && <button className="link" onClick={() => nav(v)}>{t('See all')} <Icon name="chevron" size={14} /></button>}
        </div>
        <div className={`shelf-row ${wrapRows ? 'wrap' : ''}`} style={{ ['--card' as any]: `${cardW}px` }}>
          {(wrapRows ? games.slice(0, 12) : games).map((g) => <Cover key={g.id} {...cardProps(g)} />)}
        </div>
      </section>
    ) : null;

  const home = () => {
    const recent = recentGames(visible, 14).filter((g) => matches(g, q));
    const favs = sortGames(visible.filter((g) => g.overrides.favorite && matches(g, q)), 'playtime');
    const mood = settings.vibesStyle === 'hidden' ? null : vibes(weather, visible, 18, vibeStep, settings.vibesMood ?? 'auto');
    const spotlight = recent[0] ?? favs.find((g) => g.installed) ?? visible.find((g) => g.installed) ?? visible[0];
    if (!visible.length) return <Empty q={q} view={view} onScan={scan} onAdd={() => setAdding(true)} />;
    return (
      <>
        {spotlight && !q && (
          <div className="spotlight" onClick={() => setSelected(spotlight.id)}>
            {heroOf(spotlight) ? <img className="spot-bg" src={heroOf(spotlight)} alt="" /> : <FallbackArt g={spotlight} wide bare />}
            <div className="spot-info">
              <span className="eyebrow">{recent[0] ? t('Jump back in') : t('From your library')}</span>
              {artOf(spotlight).logo ? <img className="spot-logo" src={artOf(spotlight).logo} alt={titleOf(spotlight)} onError={(e) => (e.currentTarget.style.display = 'none')} /> : <h2>{titleOf(spotlight)}</h2>}
              <div className="spot-meta">
                <SourceBadge source={spotlight.source} /> {SOURCES[spotlight.source].name} · {t('Last played')} {timeAgo(lastPlayedOf(spotlight)).toLowerCase()}
              </div>
              <button className="btn primary big" onClick={(e) => { e.stopPropagation(); launch(spotlight); }}>
                {spotlight.installed ? <><Icon name="play" fill /> {t('Play')}</> : t('Install')}
              </button>
            </div>
          </div>
        )}
        {mood && !q && (
          <section className={`vibes v-${settings.vibesStyle ?? 'panel'}`} style={vibesArt(mood.games, settings.vibesStyle) as CSSProperties | undefined}>
            <div className="vibes-text">
              <span className="eyebrow"><Icon name={mood.icon ?? (weather ? weatherIcon(weather) : 'sparkle')} size={14} /> {mood.label}</span>
              <h3>{mood.title}</h3>
              <p>{mood.text}</p>
              <small>{mood.online ? `${mood.why}.` : t("Today's picks: {why}.", { why: mood.why.toLowerCase() })}</small>
              {mood.count > 1 && (settings.vibesMood ?? 'auto') === 'auto' && (
                <button className="vibes-next" onClick={() => setVibeStep((v) => v + 1)} title={t('Show another vibe')}>
                  <Icon name="refresh" size={13} /> {t('Another vibe')}
                </button>
              )}
            </div>
            {mood.online ? (
              <PulseList kind={mood.online} onOpen={(url) => nav({ kind: 'web', id: 'store', url })} />
            ) : (
            <VibePicks games={mood.games} onOpen={(id) => setSelected(id)} onLaunch={launch} />
            )}
          </section>
        )}
        {Shelf({ name: t('Continue playing'), games: recent, v: { kind: 'recent' } })}
        {Shelf({ name: t('Most played'), games: mostPlayed(visible, 14).filter((g) => matches(g, q)), v: { kind: 'all' } })}
        {Shelf({ name: t('Favorites'), games: favs, v: { kind: 'favorites' } })}
        {library.categories.map((c) => (
          <div key={c}>{Shelf({ name: c, games: sortGames(visible.filter((g) => g.overrides.categories?.includes(c) && matches(g, q)), 'title'), v: { kind: 'category', name: c } })}</div>
        ))}
        {SOURCE_ORDER.map((s) => (
          <div key={s}>{Shelf({ name: SOURCES[s].name, games: sortGames(visible.filter((g) => g.source === s && matches(g, q)), settings.sort), v: { kind: 'source', id: s } })}</div>
        ))}
      </>
    );
  };

  const menuGame = menu && library.games.find((g) => g.id === menu.id);
  const removingGame = removing ? library.games.find((g) => g.id === removing) : undefined;

  return (
    <div className={`desktop ${settings.sidebarCollapsed ? 'collapsed' : ''}`}>
      {settings.background === 'live' || settings.background === 'video' ? (
        <div className="backdrop" aria-hidden>
          <Wallpaper kind={settings.background === 'video' ? 'video' : settings.wallpaper} video={settings.videoFile} still={settings.reduceMotion} />
          <div className="backdrop-shade wp" />
        </div>
      ) : (
        <Backdrop url={settings.background === 'image' ? settings.backgroundImage : settings.background === 'hero' ? heroOf(bgGame) : undefined} />
      )}

      <aside className="sidebar">
        <div className="brand">
          <Logo style={settings.logoStyle} />
          <span className="nav-label">Lumen</span>
          <button className="icon-btn ghost collapse" onClick={() => saveSettings({ sidebarCollapsed: !settings.sidebarCollapsed })} title={t('Collapse sidebar')}>
            <Icon name="sidebar" size={16} />
          </button>
        </div>
        <PadReadout />
        <nav>
          {navIds.map((id, i) => {
            const def = NAV_ITEMS.find((n) => n.id === id)!;
            // Section titles only make sense while the items are still grouped the default way.
            const head = !customNav && def.group === 'Explore' && NAV_ITEMS.find((n) => n.id === navIds[i - 1])?.group !== 'Explore';
            const v: View = id.startsWith('web:') ? { kind: 'web', id: id.slice(4), url: WEB_TABS.find((t) => t.id === id.slice(4))!.url } : ({ kind: id } as View);
            const count = id === 'all' ? visible.length : id === 'favorites' ? visible.filter((g) => g.overrides.favorite).length : id === 'emulation' ? visible.filter((g) => g.source === 'quiver').length : undefined;
            return (
              <div key={id} className="nav-wrap">
                {head && <div className="nav-sec">{t('Explore')}</div>}
                {id.startsWith('web:')
                  ? <button className={`nav-item ${view.kind === 'web' && view.id === id.slice(4) ? 'on' : ''}`} onClick={() => nav(v)} title={t(def.label)}><Icon name={def.icon} /><span className="nav-label">{t(def.label)}</span></button>
                  : NavItem({ v, icon: def.icon, label: def.label, count })}
              </div>
            );
          })}
          {!navHidden.includes('sec:launchers') && <>
          <div className="nav-sec">{t('Launchers')}</div>
          {SOURCE_ORDER.filter((s) => counts[s]).map((s) => (
            <button key={s} className={`nav-item ${sameView(view, { kind: 'source', id: s }) ? 'on' : ''}`} onClick={() => nav({ kind: 'source', id: s })} title={SOURCES[s].name}>
              <SourceBadge source={s} />
              <span className="nav-label">{SOURCES[s].name}</span>
              <span className="count">{counts[s]}</span>
            </button>
          ))}
          </>}
          {!navHidden.includes('sec:collections') && <>
          <div className="nav-sec">
            <span>{t('Collections')}</span>
            <button className="icon-btn ghost tiny" title={t('New collection')} onClick={() => setNewCat('')}><Icon name="plus" size={14} /></button>
          </div>
          {newCat !== null && (
            <form className="new-cat" onSubmit={(e) => { e.preventDefault(); const n = newCat.trim(); if (n && !library.categories.includes(n)) setCategories([...library.categories, n]); setNewCat(null); }}>
              <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} onBlur={() => setNewCat(null)} placeholder={t('Collection name')} />
            </form>
          )}
          {library.categories.map((c) => (
            <div key={c} className="cat-wrap">
              {NavItem({ v: { kind: 'category', name: c }, icon: 'tag', label: c, count: visible.filter((g) => g.overrides.categories?.includes(c)).length })}
              <button className="icon-btn ghost tiny del" title={`Delete ${c}`} onClick={() => { setCategories(library.categories.filter((x) => x !== c)); if (sameView(view, { kind: 'category', name: c })) nav({ kind: 'home' }); }}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
          </>}
          {library.games.some((g) => g.overrides.hidden) && NavItem({ v: { kind: 'hidden' }, icon: 'eyeOff', label: 'Hidden', count: library.games.filter((g) => g.overrides.hidden).length })}
        </nav>
        {!navHidden.includes('sec:drives') && (
          <div className="drive-panel">
            <div className="nav-sec">{t('Drive space')}</div>
            <Drives compact counts={driveCounts(library.games)} />
          </div>
        )}
        {settings.tempsOn !== false && !navHidden.includes('sec:temps') && (
          <div className="drive-panel temp-panel">
            <div className="nav-sec">{t('Temperatures')}</div>
            <Temps />
          </div>
        )}
        <DownloadPanel />
        <div className="side-foot">
          <button className="nav-item big-screen" onClick={onBigScreen} title={t('Big Screen')}>
            <Icon name="tv" /> <span className="nav-label">{t('Big Screen')}</span>
          </button>
          <button className="nav-item" onClick={() => setShowSettings(true)} title={t('Settings')}>
            <Icon name="settings" /> <span className="nav-label">{t('Settings')}</span>
          </button>
          <button className="nav-item" onClick={() => setPower(true)} title={t('Power: sleep, restart, shut down')}>
            <Icon name="power" /> <span className="nav-label">{t('Power')}</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="toolbar">
          <h1>{title}</h1>
          <div id="toolbar-slot" />
          {!explore && <div className="search">
            <Icon name="search" size={16} />
            <input ref={searchRef} value={typed} onChange={(e) => setQ(e.target.value)} placeholder={t('Search your games…')} />
            {typed && <button className="icon-btn ghost tiny" onClick={() => setQ('')}><Icon name="close" size={12} /></button>}
          </div>}
          <div className="spacer" />
          {weather?.ok && <span className="weather-chip" title={`${weather.label} in ${weather.place}, feels like ${weather.feels}°, wind ${weather.wind} ${weather.unit === 'f' ? 'mph' : 'km/h'}`}><Icon name={weatherIcon(weather)} size={16} /> {weather.temp}° {weather.label}</span>}
          {!explore && view.kind !== 'home' && view.kind !== 'recent' && (
            <select className="select" value={settings.sort} onChange={(e) => saveSettings({ sort: e.target.value as SortKey })} title="Sort">
              <option value="playtime">{t('Most played')}</option>
              <option value="recent">{t('Recently played')}</option>
              <option value="title">A to Z</option>
              <option value="added">{t('Recently added')}</option>
              <option value="source">{t('Launcher')}</option>
            </select>
          )}
          {!explore && view.kind !== 'home' && (
            <Segmented<DesktopLayout>
              value={settings.layout === 'shelves' ? 'grid' : settings.layout}
              onChange={(v) => saveSettings({ layout: v })}
              options={[{ value: 'grid', label: <Icon name="grid" size={16} />, title: 'Grid' }, { value: 'list', label: <Icon name="list" size={16} />, title: 'List' }]}
            />
          )}
          {!explore && <input className="size" type="range" min={120} max={300} value={settings.cardSize} onChange={(e) => saveSettings({ cardSize: Number(e.target.value) })} title={t('Cover size')} />}
          {!explore && notInstalledCount > 0 && (
            <button className={`toggle-chip ${settings.showUninstalled ? '' : 'on'}`} onClick={() => saveSettings({ showUninstalled: !settings.showUninstalled })}
              title={`${notInstalledCount} games you own aren't installed`}>
              {settings.showUninstalled ? t('All owned ({n} not installed)', { n: notInstalledCount }) : t('Installed only')}
            </button>
          )}
          <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> {t('Add a game')}</button>
          <button className={`btn ${scanning ? 'busy' : ''}`} onClick={scan} disabled={scanning} title={t('Scan all launchers again')}>
            <Icon name="refresh" size={16} className={scanning ? 'spin' : ''} /> {scanning ? 'Scanning' : 'Rescan'}
          </button>
        </div>

        <div className={`content ${view.kind === 'web' ? 'web' : ''}`}>
          {view.kind === 'home' ? home()
            : view.kind === 'deals' ? <Deals onOpen={(url) => nav({ kind: 'web', id: 'store', url })} />
            : view.kind === 'lookup' ? <Lookup onOpen={(url) => nav({ kind: 'web', id: 'store', url })} />
            : view.kind === 'web' ? <WebTab url={view.url} />
            : renderList(list, settings.layout === 'list' ? 'list' : 'grid')}
        </div>
      </main>

      {selectedGame && <GamePage g={selectedGame} onClose={() => setSelected(null)} onEdit={() => setEditing(selectedGame.id)} />}

      {menu && menuGame && (
        <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { launch(menuGame); setMenu(null); }}><Icon name="play" size={14} /> {menuGame.installed ? 'Play' : 'Install'}</button>
          <button onClick={() => { update(menuGame.id, { favorite: !menuGame.overrides.favorite }); setMenu(null); }}><Icon name="star" size={14} /> {menuGame.overrides.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
          <button onClick={() => { setEditing(menuGame.id); setMenu(null); }}><Icon name="edit" size={14} /> {t('Edit and artwork')}</button>
          {library.categories.length > 0 && <div className="ctx-sec">{t('Collections')}</div>}
          {library.categories.map((c) => {
            const on = menuGame.overrides.categories?.includes(c);
            return (
              <button key={c} onClick={() => update(menuGame.id, { categories: on ? menuGame.overrides.categories!.filter((x) => x !== c) : [...(menuGame.overrides.categories ?? []), c] })}>
                <span className="check">{on ? '✓' : ''}</span> {c}
              </button>
            );
          })}
          <div className="ctx-sec" />
          {menuGame.installDir && <button onClick={() => { api.openFolder(menuGame.installDir!); setMenu(null); }}><Icon name="folder" size={14} /> {t('Open install folder')}</button>}
          <button onClick={() => { update(menuGame.id, { hidden: !menuGame.overrides.hidden }); setMenu(null); }}><Icon name="eyeOff" size={14} /> {menuGame.overrides.hidden ? 'Unhide' : 'Hide'}</button>
          {menuGame.installed && <button className="danger" onClick={() => { setRemoving(menuGame.id); setMenu(null); }}><Icon name="trash" size={14} /> {t('Uninstall')}</button>}
        </div>
      )}

      {removingGame && (
        <Modal title={`Uninstall ${titleOf(removingGame)}?`} onClose={() => setRemoving(null)} footer={
          <>
            <button className="btn" onClick={() => setRemoving(null)}>{t('Keep it')}</button>
            <button className="btn danger" onClick={() => { const g = removingGame; setRemoving(null); uninstall(g); }}>{t('Uninstall')}</button>
          </>
        }>
          <p>This removes the game's files from your PC. {SOURCES[removingGame.source].name} does the removing and may ask you to confirm again. You keep the game in your account, so you can install it later from here.</p>
          {removingGame.installDir && <p className="hint">{removingGame.installDir}</p>}
        </Modal>
      )}

      {editing && <GameEditor id={editing} onClose={() => setEditing(null)} />}
      {adding && <AddGame onClose={() => setAdding(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {power && <PowerMenu onClose={() => setPower(false)} />}
    </div>
  );
}

function Backdrop({ url }: { url?: string }) {
  return (
    <div className="backdrop" aria-hidden>
      {url && <img key={url} src={url} alt="" />}
      <div className="backdrop-shade" />
    </div>
  );
}

function Empty({ q, view, onScan, onAdd }: { q: string; view: View; onScan(): void; onAdd(): void }) {
  const { settings } = useLumen();
  if (q) return <div className="empty"><h3>{t('Nothing matches “{q}”', { q })}</h3><p>{t('Try another name or a collection.')}</p></div>;
  if (view.kind === 'favorites') return <div className="empty"><h3>{t('No favorites yet')}</h3><p>{t('Right-click a game, or press the star on its page, to pin it here.')}</p></div>;
  if (view.kind === 'category') return <div className="empty"><h3>{t('This collection is empty')}</h3><p>{t('Right-click any game and tick “{name}” to add it.', { name: view.name })}</p></div>;
  if (view.kind === 'emulation') return (
    <div className="empty">
      <Icon name="joystick" size={48} />
      <h3>{t('No Quiver Launcher games yet')}</h3>
      <p>{t('This tab holds the ports, recompilations and fan projects you installed with Quiver Launcher. If yours lives somewhere else, put that folder in Settings → Library, next to the Quiver switch, then scan again.')}</p>
      <p className="muted small">%APPDATA%\com.quiverlauncher.app · %LOCALAPPDATA%\QuiverLauncher · apps.json</p>
      <div className="row-btns">
        <button className="btn primary" onClick={onScan}><Icon name="refresh" size={16} /> {t('Scan launchers')}</button>
      </div>
    </div>
  );
  return (
    <div className="empty">
      <Logo size={56} style={settings.logoStyle} />
      <h3>{t('Your library is empty')}</h3>
      <p>{t('Lumen looks for games from Steam, Epic, GOG, EA, Ubisoft, Xbox, Battle.net and Amazon. Install a game in any of them, then scan again, or add any program yourself.')}</p>
      <div className="row-btns">
        <button className="btn primary" onClick={onScan}><Icon name="refresh" size={16} /> {t('Scan launchers')}</button>
        <button className="btn" onClick={onAdd}><Icon name="plus" size={16} /> {t('Add a game')}</button>
      </div>
    </div>
  );
}

/** Which controllers are plugged in, under the logo. Nothing is shown when there are none. */
function PadReadout() {
  const { pads } = usePadInfo();
  if (!pads.length) return null;
  return (
    <div className="pad-readout" title={pads.map((p) => `Player ${p.index}: ${p.name}${p.battery === undefined ? '' : ` — battery ${p.battery}%`}`).join('\n')}>
      {pads.map((p) => (
        <div key={p.index} className="pad-line">
          <Icon name="gamepad" size={16} />
          {pads.length > 1 && <b className="pad-num">{p.index}</b>}
          <span className="nav-label">{p.name}</span>
          {p.battery !== undefined && <Battery percent={p.battery} size={14} />}
        </div>
      ))}
    </div>
  );
}

function GamePage({ g, onClose, onEdit }: { g: Game; onClose(): void; onEdit(): void }) {
  const { launch, update, uninstall, library } = useLumen();
  const a = artOf(g);
  // Removing a game takes files off the PC, so it is always asked first, never done on one click.
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="gamepage-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gamepage">
        <div className="gp-hero">
          {heroOf(g) ? <img src={heroOf(g)} alt="" /> : <FallbackArt g={g} wide bare />}
          <button className="icon-btn gp-close" onClick={onClose} aria-label={t('Close')}><Icon name="close" /></button>
          <div className="gp-title">
            {a.logo ? <img className="gp-logo" src={a.logo} alt={titleOf(g)} onError={(e) => (e.currentTarget.style.display = 'none')} /> : <h2>{titleOf(g)}</h2>}
          </div>
        </div>
        <div className="gp-bar">
          {g.installed ? (
            <button className="btn primary big" onClick={() => launch(g)}><Icon name="play" fill /> Play</button>
          ) : (
            <button className="btn big" onClick={() => launch(g)} disabled={!g.install}>{g.install ? `Install with ${SOURCES[g.source].name}` : 'Not found on this PC'}</button>
          )}
          <div className="gp-stats">
            <div><span>{t('Launcher')}</span><b><SourceBadge source={g.source} /> {SOURCES[g.source].name}</b></div>
            <div><span>{t('Last played')}</span><b>{timeAgo(lastPlayedOf(g))}</b></div>
            <div><span>{t('Sessions')}</span><b>{g.overrides.playCount ?? 0}</b></div>
            <div><span>{t('Play time')}</span><b>{playtime(minutesOf(g))}</b></div>
            <Achievements id={g.id} label={t('Achievements')} />
          </div>
          <div className="spacer" />
          <button className={`icon-btn ${g.overrides.favorite ? 'active' : ''}`} title={t('Favorite')} onClick={() => update(g.id, { favorite: !g.overrides.favorite })}><Icon name="star" fill={g.overrides.favorite} /></button>
          <button className="icon-btn" title={t('Edit and artwork')} onClick={onEdit}><Icon name="edit" /></button>
          {g.installDir && <button className="icon-btn" title={t('Open install folder')} onClick={() => api.openFolder(g.installDir!)}><Icon name="folder" /></button>}
          <button className="icon-btn" title={g.overrides.hidden ? t('Unhide') : t('Hide')} onClick={() => update(g.id, { hidden: !g.overrides.hidden })}><Icon name="eyeOff" /></button>
          {g.installed && <button className="icon-btn danger" title={t('Uninstall {game}', { game: titleOf(g) })} onClick={() => setConfirmRemove(true)}><Icon name="trash" /></button>}
        </div>
        {confirmRemove && (
          <Modal title={`Uninstall ${titleOf(g)}?`} onClose={() => setConfirmRemove(false)} footer={
            <>
              <button className="btn" onClick={() => setConfirmRemove(false)}>{t('Keep it')}</button>
              <button className="btn danger" onClick={() => { setConfirmRemove(false); uninstall(g); }}>{t('Uninstall')}</button>
            </>
          }>
            <p>This removes the game's files from your PC. {SOURCES[g.source].name} does the removing and may ask you to confirm again. You keep the game in your account, so you can install it later from here.</p>
            {g.installDir && <p className="hint">{g.installDir}</p>}
          </Modal>
        )}
        <div className="gp-body">
          <div className="chips">
            {library.categories.map((c) => {
              const on = g.overrides.categories?.includes(c);
              return (
                <button key={c} className={`chip ${on ? 'on' : ''}`} onClick={() => update(g.id, { categories: on ? g.overrides.categories!.filter((x) => x !== c) : [...(g.overrides.categories ?? []), c] })}>
                  {on ? '✓ ' : '+ '}{c}
                </button>
              );
            })}
          </div>
          <textarea className="notes" placeholder={t('Notes: where you left off, mods, controls…')} defaultValue={g.overrides.notes ?? ''} onBlur={(e) => e.target.value !== (g.overrides.notes ?? '') && update(g.id, { notes: e.target.value })} />
          <About g={g} />
          {g.installDir && <div className="path muted">Installed at {g.installDir}</div>}
        </div>
      </div>
    </div>
  );
}

export function useGameInfo(id: string | undefined) {
  const [info, setInfo] = useState<GameInfo | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setInfo(undefined);
    api.gameInfo(id).then((i) => live && setInfo(i)).catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [id]);
  return info;
}

/** Your own achievement progress, which only Steam can tell us and only for your own account. */
export function useAchievements(id: string | undefined) {
  const [p, setP] = useState<AchievementProgress | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setP(undefined);
    api.achievements?.(id).then((v) => live && setP(v)).catch(() => undefined);
    return () => { live = false; };
  }, [id]);
  return p;
}

/**
 * The achievements line: the cup, how many the game has, and how many you have earned when
 * Steam will say. The cup fills in as you go and turns gold on the last one.
 */
/** The picks on the vibes card, swapping to the next handful every few seconds. */
function VibePicks({ games, onOpen, onLaunch }: { games: Game[]; onOpen(id: string): void; onLaunch(g: Game): void }) {
  const size = 6;
  const { from, fade } = useCycle(games.length, size, 6000);
  if (!games.length) return null;
  return (
    <div className={`vibes-games ${fade ? 'fading' : ''}`}>
      {games.slice(from, from + size).map((g) => (
        <button key={g.id} className="vibe-game" title={titleOf(g)} onClick={() => onOpen(g.id)} onDoubleClick={() => onLaunch(g)}>
          <Cover g={g} showBadge={false} />
        </button>
      ))}
    </div>
  );
}

/** The live list on the vibes card: headlines, new releases or the world chart. */
export function PulseList({ kind, onOpen, big }: { kind: PulseKind; onOpen?(url: string): void; big?: boolean }) {
  const { items, loading } = usePulse(kind);
  // In Big Screen the card floats over the first row of games, so it stays short: fewer lines, and
  // no news summary. The desktop card sits in the page and can afford more.
  const max = kind === 'news' ? (big ? 2 : 3) : big ? 4 : 5;
  // The list keeps moving: a new slice every few seconds, with a short fade between.
  const { from, fade, pages } = useCycle(items.length, max, 6000);
  const waiting = kind === 'news' ? t('Reading the headlines…') : t('Reading Steam…');
  const failed = kind === 'news' ? t('The news could not be reached right now.') : t('Steam could not be reached right now.');
  if (loading && !items.length) return <div className="pulse-list muted"><span className="pulse-wait">{waiting}</span></div>;
  if (!items.length) return <div className="pulse-list muted"><span className="pulse-wait">{failed}</span></div>;
  return (
    <div className={`pulse-list ${kind} ${big ? 'big' : ''} ${fade ? 'fading' : ''}`}>
      {items.slice(from, from + max).map((it) => (
        <button key={it.id} type="button" className="pulse-item" onClick={() => onOpen?.(it.url)} disabled={!onOpen} title={it.sub ?? it.title}>
          {it.image && <img src={it.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <span className="pulse-text">
            <b>{it.title}</b>
            {it.meta && <em>{it.meta}</em>}
            {it.sub && kind === 'news' && !big && <small>{it.sub}</small>}
          </span>
        </button>
      ))}
      {pages > 1 && <span className="pulse-dots">{Array.from({ length: pages }, (_, i) => <i key={i} className={i === Math.floor(from / max) ? 'on' : ''} />)}</span>}
    </div>
  );
}

/** The "Photo" look borrows the artwork of the first pick as a dimmed backdrop. */
function vibesArt(games: Game[], style: string | undefined): Record<string, string> | undefined {
  if (style !== 'photo') return undefined;
  const url = games.map((g) => heroOf(g) ?? artOf(g).cover).find(Boolean);
  return url ? { '--vibes-art': `url("${url}")` } : undefined;
}

export function Achievements({ id, total, big, label }: { id: string; total?: number; big?: boolean; label?: string }) {
  const mine = useAchievements(id);
  const all = mine?.total ?? total;
  if (!all) return null;
  const done = mine?.unlocked;
  const pct = done !== undefined ? Math.round((done / all) * 100) : undefined;
  const full = pct === 100;
  return (
    <div className={`ach ${big ? 'big' : ''} ${full ? 'full' : ''}`} title={done !== undefined ? t('{done} of {all} achievements earned', { done, all }) : t('{all} achievements in this game', { all })}>
      {label && <span className="ach-label">{label}</span>}
      <span className="ach-head">
        <Icon name={full ? 'trophy' : 'medal'} size={big ? 22 : 16} />
        <b>{done !== undefined ? `${done} / ${all}` : all}</b>
        {pct !== undefined && <em>{pct}%</em>}
      </span>
      {pct !== undefined && <span className="ach-bar"><i style={{ width: `${pct}%` }} /></span>}
    </div>
  );
}

function About({ g }: { g: Game }) {
  const info = useGameInfo(g.id);
  const [shot, setShot] = useState<string | null>(null);
  if (info === undefined) return <div className="about muted">{t('Loading game info…')}</div>;
  const steamDb = info?.steamAppId ? `https://steamdb.info/app/${info.steamAppId}/` : `https://steamdb.info/search/?a=app&q=${encodeURIComponent(titleOf(g))}`;
  return (
    <section className="about">
      <div className="about-head">
        <h3><Icon name="info" size={16} /> {t('About this game')}</h3>
        <div className="row-btns">
          {info?.steamAppId && <a className="btn small" href={`https://store.steampowered.com/app/${info.steamAppId}/`} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> {t('Steam store')}</a>}
          <a className="btn small" href={steamDb} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> {t('Open on SteamDB')}</a>
          {info?.website && <a className="btn small ghost" href={info.website} target="_blank" rel="noreferrer">{t('Website')}</a>}
        </div>
      </div>
      {!info || !info.description ? (
        <p className="muted">{t('No store details found for this game.')}</p>
      ) : (
        <>
          <p className="about-desc">{info.description}</p>
          <div className="about-grid">
            {info.developers?.length ? <div><span>{t('Developer')}</span><b>{info.developers.join(', ')}</b></div> : null}
            {info.publishers?.length ? <div><span>{t('Publisher')}</span><b>{info.publishers.join(', ')}</b></div> : null}
            {info.releaseDate && <div><span>{t('Released')}</span><b>{info.releaseDate}</b></div>}
            {info.metacritic && <div><span>{t('Metacritic')}</span><b className="score">{info.metacritic}</b></div>}
          </div>
          <StoreFacts info={info} />
          {info.tags?.length ? <div className="chips">{info.tags.map((x) => <span key={x} className="chip on">{x}</span>)}</div>
            : info.genres?.length ? <div className="chips">{info.genres.map((x) => <span key={x} className="chip on">{x}</span>)}{info.features?.slice(0, 6).map((x) => <span key={x} className="chip">{x}</span>)}</div> : null}
          {info.screenshots?.length ? (
            <div className="shots">{info.screenshots.map((u) => <button key={u} onClick={() => setShot(u)}><img src={u} alt="" loading="lazy" /></button>)}</div>
          ) : null}
          {info.matchedByTitle && <p className="hint">{t('Matched to the Steam store by name, so details may belong to a different edition.')}</p>}
        </>
      )}
      {shot && <div className="lightbox" onClick={() => setShot(null)}><img src={shot} alt="" /></div>}
    </section>
  );
}

/** The downloads the launchers are working on, kept in the sidebar so you watch them inside Lumen. */
function DownloadPanel() {
  const { downloads, notify } = useLumen();
  if (!downloads.length) return null;
  // A download the launcher is holding (its queue is paused, another one is ahead, or it only
  // downloads at set hours) will not move until someone tells the launcher to go, and that
  // button lives in the launcher, not here. So offer the way there instead of a dead progress bar.
  const open = async (d: { source: Game['source']; title: string }) => {
    const r = await api.openDownloads(d.source);
    if (!r.ok) notify(r.missingLauncher ? t('{launcher} is not installed on this PC', { launcher: r.missingLauncher }) : r.error || t('Could not open that launcher'));
  };
  return (
    <div className="dl-panel">
      <div className="nav-sec"><span>{t('Downloads')}</span><span className="count">{downloads.length}</span></div>
      {downloads.map((d) => (
        <div key={d.gameId} className={`dl-row${downloadWaiting(d.state) ? ' waiting' : ''}`} title={downloadLabel(d)}>
          <div className="dl-head"><SourceBadge source={d.source} /> <span className="dl-name">{d.title}</span>{d.percent !== undefined && <b>{d.percent}%</b>}</div>
          <div className="dl-bar"><i style={{ width: `${d.percent ?? 4}%` }} className={d.percent === undefined ? 'wait' : ''} /></div>
          <small>{downloadLabel(d)}</small>
          {downloadWaiting(d.state) && (
            <button className="dl-open" onClick={() => open(d)}>
              <Icon name="download" size={14} /> {t('Start it in the launcher')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
