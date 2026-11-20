import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../shared/types';
import { Cover, FallbackArt, SourceBadge, PadBadge, DownloadOverlay, wideChain, PAD_LABEL, heroOf } from '../components/Cover';
import { Icon, Logo } from '../components/Icon';
import { Drives, driveCounts } from '../components/Drives';
import { TempChip, Temps } from '../components/Temps';
import { useKeyboard } from '../components/Keyboard';
import { api } from '../lib/api';
import { Battery } from '../components/Battery';
import { usePad, usePadInfo, type PadAction } from '../lib/gamepad';
import { artOf, lastPlayedOf, minutesOf, mostPlayed, playtime, recentGames, sortGames, timeAgo, titleOf } from '../lib/library';
import { SOURCES, SOURCE_ORDER } from '../lib/sources';
import { downloadLabel, downloadShort, downloadWaiting, useLumen } from '../lib/store';
import { THEMES } from '../lib/themes';
import { PowerMenu } from '../components/PowerMenu';
import { Wallpaper } from '../components/Wallpaper';
import { playSound } from '../lib/sound';
import { useWeather, weatherIcon } from '../lib/weather';
import { vibes } from '../lib/vibes';
import { useCommand } from '../lib/commands';
import { Achievements, PulseList, useGameInfo } from './Desktop';
import { t } from '../lib/i18n';
import { SettingsPanel } from './Settings';

const ALL_TABS = ['Home', 'Controller', 'Emulation', 'Library', 'Favorites'] as const;
type Tab = (typeof ALL_TABS)[number];
interface Row { id: string; name: string; games: Game[]; note?: string; icon?: string; why?: string; head?: string; label?: string }

const MUSIC_NAMES: Record<string, string> = {
  off: 'Off', custom: 'My music', shuffle: 'Shuffle', lumen: 'Drift', crisp: 'Late night', bubbly: 'Plaza',
  airy: 'Deep space', nebula: 'Nebula', orbit: 'Orbit', pulsar: 'Pulsar', tides: 'Tides', driftwood: 'Driftwood'
};
const MUSIC_NAME = (id: string) => MUSIC_NAMES[id] ?? id;

/**
 * On a TV there is no mouse to move out of the way. An install or uninstall box leaves the Windows
 * pointer wherever it was last clicked, and the controller-as-mouse helper leaves it in the middle
 * of the screen, so an arrow sits on top of Big Screen for good. Big Screen therefore hides the
 * pointer and only brings it back while a hand is really moving the mouse.
 */
function useIdleCursor(idleMs = 2500) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let x = -1;
    let y = -1;
    const hide = () => document.body.classList.add('no-cursor');
    const wake = (e: MouseEvent) => {
      // A pointer that has not actually moved is a redraw or the helper, not a hand on the mouse.
      if (e.type === 'mousemove' && e.clientX === x && e.clientY === y) return;
      x = e.clientX;
      y = e.clientY;
      document.body.classList.remove('no-cursor');
      if (timer) clearTimeout(timer);
      timer = setTimeout(hide, idleMs);
    };
    hide();
    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('mousedown', wake, { passive: true });
    window.addEventListener('wheel', wake, { passive: true });
    return () => {
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('wheel', wake);
      if (timer) clearTimeout(timer);
      document.body.classList.remove('no-cursor');
    };
  }, [idleMs]);
}

export function BigScreen({ onExit }: { onExit(): void }) {
  const { library, settings, downloads, launch, update, uninstall, scan, saveSettings, scanning } = useLumen();
  const [tab, setTab] = useState<Tab>('Home');
  const [pos, setPos] = useState({ r: 0, c: 0 });
  const [detail, setDetail] = useState<string | null>(null);
  // Uninstalling takes files off the PC, so the buttons turn into a yes or no first.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const padInfo = usePadInfo();
  const [detailBtn, setDetailBtn] = useState(0);
  const [menu, setMenu] = useState(false);
  const [menuIdx, setMenuIdx] = useState(0);
  const [pad, setPad] = useState(false);
  const [power, setPower] = useState(false);
  const [allSettings, setAllSettings] = useState(false);
  // Closing is its own state so the panel can ride back out to the right instead of vanishing
  // while the library slides home. It unmounts when the slide has finished.
  const [settingsOut, setSettingsOut] = useState(false);
  const closeSettings = () => {
    setSettingsOut(true);
    window.setTimeout(() => { setAllSettings(false); setSettingsOut(false); }, 340);
  };
  // Y opens search with the on-screen keyboard, so a controller can find a game by name.
  const [search, setSearch] = useState<string | null>(null);
  const [hitIdx, setHitIdx] = useState(0);
  // Tabs in the user's order, minus the hidden ones. At least one always stays.
  const TABS = useMemo(() => {
    const order = [...(settings.bigTabs ?? []).filter((t): t is Tab => (ALL_TABS as readonly string[]).includes(t)), ...ALL_TABS.filter((t) => !(settings.bigTabs ?? []).includes(t))];
    const shown = order.filter((t) => !(settings.bigTabsHidden ?? []).includes(t));
    return shown.length ? shown : [order[0]];
  }, [settings.bigTabs, settings.bigTabsHidden]);
  const weather = useWeather(!!settings.weatherOn, `${settings.weatherCity}|${settings.weatherUnit}`);
  // a short console-style start-up when Big Screen opens
  const intro = settings.bigScreenIntro !== false && !settings.reduceMotion;
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    playSound(intro ? 'intro' : 'launch');
    const t = setTimeout(() => setBooting(false), intro ? 3000 : 500);
    return () => clearTimeout(t);
  }, []);
  // The way out plays the logo closing down, then hands back to the desktop view.
  const [leaving, setLeaving] = useState(false);
  const leave = () => {
    if (leaving) return;
    if (!intro) return onExit();
    setMenu(false); setPower(false);
    setLeaving(true);
    playSound('outro');
    setTimeout(onExit, 2300);
  };
  useCommand((cmd) => cmd === 'power' && setPower(true));
  useIdleCursor();
  // The row of button hints along the bottom is for the first evenings. It fades out a few seconds
  // after the last press and comes straight back on the next one, so it is there when you have
  // forgotten a button and gone when you have not.
  const hintsMode = settings.bigScreenHints ?? 'auto';
  const [hintsOn, setHintsOn] = useState(true);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>();
  const wakeHints = useRef(() => {});
  wakeHints.current = () => {
    if (hintsMode !== 'auto') return;
    setHintsOn(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintsOn(false), 6000);
  };
  useEffect(() => {
    if (hintsMode !== 'auto') {
      setHintsOn(hintsMode === 'always');
      return;
    }
    const wake = () => wakeHints.current();
    wake();
    for (const ev of ['keydown', 'mousemove', 'mousedown', 'wheel'] as const) window.addEventListener(ev, wake, { passive: true });
    return () => {
      for (const ev of ['keydown', 'mousemove', 'mousedown', 'wheel'] as const) window.removeEventListener(ev, wake);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [hintsMode]);
  // While Big Screen is up, launcher windows that steal the screen can be answered with the controller.
  useEffect(() => {
    api.bigScreenActive?.(true);
    return () => { api.bigScreenActive?.(false); };
  }, []);
  const [now, setNow] = useState(new Date());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => library.games.filter((g) => !g.overrides.hidden && (g.installed || (g.owned && settings.showUninstalled))), [library.games, settings.showUninstalled]);


  // What the search finds, best match first: a name that starts with what you typed wins.
  const hits = useMemo(() => {
    const q = (search ?? '').trim().toLowerCase();
    if (!q) return [] as typeof visible;
    const score = (g: (typeof visible)[number]) => {
      const t = titleOf(g).toLowerCase();
      return t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2;
    };
    return visible.filter((g) => score(g) < 2).sort((a, b) => score(a) - score(b) || titleOf(a).localeCompare(titleOf(b))).slice(0, 24);
  }, [search, visible]);
  const [keys, keysView] = useKeyboard(
    (fn) => { setSearch((t) => fn(t ?? '')); setHitIdx(0); },
    () => setSearch(null),
    search !== null
  );
  // The vibes card and its picks row share one mood, worked out once.
  const mood = useMemo(
    () => (settings.vibesStyle === 'hidden' ? null : vibes(weather, visible, 12, 0, settings.vibesMood ?? 'auto')),
    [settings.vibesStyle, settings.vibesMood, visible, weather]
  );
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const id of settings.bigScreenRows) {
      if (id === 'recent') out.push({ id, name: t('Continue playing'), games: recentGames(visible, 20) });
      if (id === 'mostPlayed') out.push({ id, name: t('Most played'), games: mostPlayed(visible, 20) });
      if (id === 'favorites') out.push({ id, name: t('Favorites'), games: sortGames(visible.filter((g) => g.overrides.favorite), 'title') });
      if (id === 'all') out.push({ id, name: t('All games'), games: sortGames(visible, 'playtime') });
      if (id === 'added') out.push({ id, name: t('Recently added'), games: sortGames(visible, 'added').slice(0, 20) });
      if (id === 'collections') for (const c of library.categories) out.push({ id: `c:${c}`, name: c, games: sortGames(visible.filter((g) => g.overrides.categories?.includes(c)), 'title') });
      if (id === 'sources') for (const s of SOURCE_ORDER) out.push({ id: `s:${s}`, name: SOURCES[s].name, games: sortGames(visible.filter((g) => g.source === s), 'title') });
    }
    const filled = out.filter((r) => r.games.length);
    // The mood's picks sit right under the first row. Moods that read from Steam have no picks of
    // their own, so they stay on the card alone.
    if (mood && mood.games.length && filled.length) filled.splice(1, 0, { id: 'vibes', name: t('{label} picks', { label: mood.label }), head: mood.title, games: mood.games, note: mood.text, why: `Today's picks: ${mood.why.toLowerCase()}.`, icon: mood.icon ?? (weather ? weatherIcon(weather) : 'sparkle'), label: mood.label });
    return filled.length ? filled : [{ id: 'all', name: t('All games'), games: sortGames(visible, 'title') }];
  }, [settings.bigScreenRows, mood, visible, library.categories, weather]);

  const gridGames = useMemo(() => {
    if (tab === 'Favorites') return sortGames(visible.filter((g) => g.overrides.favorite), 'title');
    // Games that play with a controller, the fully supported ones first. Exactly what you want on a
    // TV, where a keyboard is not within reach.
    if (tab === 'Controller') {
      const pads = visible.filter((g) => g.controller === 'full' || g.controller === 'partial');
      return [...sortGames(pads.filter((g) => g.controller === 'full'), 'playtime'), ...sortGames(pads.filter((g) => g.controller === 'partial'), 'playtime')];
    }
    // Quiver Launcher's games: ports, recompilations and fan projects, the console ones among them.
    if (tab === 'Emulation') return sortGames(visible.filter((g) => g.source === 'quiver'), 'playtime');
    if (tab === 'Home') return [...recentGames(visible, 100), ...sortGames(visible.filter((g) => !lastPlayedOf(g)), 'playtime')];
    return sortGames(visible, 'playtime');
  }, [tab, visible]);

  const useGrid = tab !== 'Home' || settings.bigScreenLayout === 'grid';
  const shape = settings.cardShape ?? 'portrait';
  const ratio = shape === 'landscape' ? 0.5625 : shape === 'square' ? 1 : 1.5;
  // How many cards fit across a row, for the "centered" and "page by page" row scrolling.
  const rowProbe = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(6);
  useLayoutEffect(() => {
    const probe = rowProbe.current;
    if (!probe) return;
    const measure = () => {
      const cw = (probe.children[0] as HTMLElement).offsetWidth || 200;
      const gap = (probe.children[1] as HTMLElement).offsetWidth || 24;
      setPerRow(Math.max(1, Math.floor((window.innerWidth - 112 + gap) / (cw + gap))));
    };
    measure();
    // Card width comes from CSS (size and shape), which can land a moment after this runs, so watch it.
    const ro = new ResizeObserver(measure);
    ro.observe(probe.children[0]);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [settings.bigScreenCardSize, shape]);
  const follow = settings.bigScreenFollow ?? 'follow';
  const rowShift1 = (center: number) => (follow === 'center' ? Math.max(0, center - (perRow - 1) / 2) : follow === 'page' ? Math.floor(center / perRow) * perRow : Math.max(0, center - 1));
  // Grid geometry, measured from the screen: how many columns fit, and how tall a row is.
  const [gm, setGm] = useState({ cols: 6, rowH: 400, cardH: 370, h: 700 });
  const probeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = gridRef.current, probe = probeRef.current;
    if (!useGrid || !el || !probe) return;
    const measure = () => {
      const cw = (probe.children[0] as HTMLElement).offsetWidth || 200;
      const gap = (probe.children[1] as HTMLElement).offsetWidth || 24;
      const inner = el.clientWidth - 112;
      const cols = Math.max(1, Math.floor((inner + gap) / (cw + gap)));
      const cardH = ((inner - (cols - 1) * gap) / cols) * ratio;
      setGm((g) => (g.cols === cols && Math.abs(g.cardH - cardH) < 0.5 && g.h === el.clientHeight ? g : { cols, cardH, rowH: cardH + 30, h: el.clientHeight }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [useGrid, settings.bigScreenCardSize, shape, visible.length === 0]);
  const columns = () => gm.cols;

  const focused: Game | undefined = useGrid ? gridGames[pos.c] : rows[pos.r]?.games[pos.c];
  const detailGame = library.games.find((g) => g.id === detail);
  // The buttons on a game's page, in the order the stick moves through them.
  const detailActions = useMemo(() => {
    const g = detailGame;
    if (!g) return [] as { label: string; icon?: JSX.Element; kind?: string; run(): void }[];
    if (confirmRemove)
      return [
        { label: t('Keep it'), run: () => { setConfirmRemove(false); setDetailBtn(0); } },
        { label: t('Uninstall {game}', { game: titleOf(g) }), kind: 'danger', icon: <Icon name="trash" size={22} />, run: () => { setConfirmRemove(false); setDetailBtn(0); uninstall(g); } }
      ];
    const list: { label: string; icon?: JSX.Element; kind?: string; run(): void }[] = [
      { label: g.installed ? t('Play') : t('Install'), kind: 'primary', icon: g.installed ? <Icon name="play" fill size={22} /> : undefined, run: () => { launch(g); } },
      { label: g.overrides.favorite ? t('Unfavorite') : t('Favorite'), icon: <Icon name="star" fill={g.overrides.favorite} size={22} />, run: () => { update(g.id, { favorite: !g.overrides.favorite }); } }
    ];
    if (g.installed) list.push({ label: t('Uninstall'), icon: <Icon name="trash" size={22} />, run: () => { setConfirmRemove(true); setDetailBtn(0); } });
    list.push({ label: t('Back'), run: () => setDetail(null) });
    return list;
  }, [detailGame, confirmRemove, launch, update, uninstall]);

  useEffect(() => { setConfirmRemove(false); }, [detail]);

  const rowsRef = useRef<HTMLDivElement>(null);
  // the column you were last on in each row, so a row keeps its place when you come back to it
  const colMem = useRef<Record<string, number>>({});
  if (!useGrid && rows[pos.r]) colMem.current[rows[pos.r].id] = pos.c;
  const [rowShift, setRowShift] = useState(0);

  // Keep the focused card on screen: the active row slides to the top, and its track scrolls sideways.
  useLayoutEffect(() => {
    const card = document.querySelector<HTMLElement>('.bs .card.focused');
    if (!card) return;
    if (useGrid) return; // the grid positions itself from its measurements, see below
    // rows slide sideways with a CSS transform (see .bs-strip), so only the vertical position is measured here
    const row = rowsRef.current?.children[pos.r] as HTMLElement | undefined;
    setRowShift(row ? row.offsetTop : 0);
  }, [pos, tab, useGrid, rows.length]);

  useEffect(() => setPos({ r: 0, c: 0 }), [tab]);
  // The menu is taller than a TV screen once the drives and temperatures are in it, and it
  // scrolls, so the selected row has to be brought into view. Without this the last entries sit
  // below the bottom edge: you can select them, you just cannot see what you selected.
  useEffect(() => {
    if (!menu) return;
    document.querySelector('.bs-menu .bs-menu-item.focused')?.scrollIntoView({ block: 'nearest' });
  }, [menu, menuIdx]);
  useEffect(() => { if (!TABS.includes(tab)) setTab(TABS[0]); }, [TABS, tab]);

  const themeIdx = Math.max(0, THEMES.findIndex((t) => t.id === settings.theme));
  // The first menu entry picks up the game you played last, since that is what "resume" should mean.
  // With nothing played yet it is simply the way back out of the menu.
  const lastPlayed = recentGames(visible, 1)[0];
  const menuItems: { icon: string; sec: string; label: string; run(): void; cycle?: boolean }[] = [
    lastPlayed
      ? { icon: 'play', sec: '', label: t('Resume {game}', { game: titleOf(lastPlayed) }), run: () => { setMenu(false); launch(lastPlayed); } }
      : { icon: 'chevronLeft', sec: '', label: t('Close menu'), run: () => setMenu(false) },
    { icon: 'refresh', sec: t('Library'), label: scanning ? t('Scanning…') : t('Scan launchers'), run: () => scan() },
    { icon: 'eyeOff', sec: t('Library'), label: t('Not installed: {state}', { state: settings.showUninstalled ? t('Shown') : t('Hidden') }), run: () => saveSettings({ showUninstalled: !settings.showUninstalled }), cycle: true },
    { icon: 'shelves', sec: t('Look'), label: t('Scrolling: {mode}', { mode: settings.bigScreenLayout === 'rows' ? t('Horizontal rows') : t('Vertical grid') }), run: () => saveSettings({ bigScreenLayout: settings.bigScreenLayout === 'rows' ? 'grid' : 'rows' }), cycle: true },
    { icon: 'list', sec: t('Look'), label: t('Row movement: {mode}', { mode: t({ follow: 'Follow', center: 'Centered', page: 'Page by page' }[follow]) }), run: () => { const o = ['follow', 'center', 'page'] as const; saveSettings({ bigScreenFollow: o[(o.indexOf(follow) + 1) % 3] }); }, cycle: true },
    { icon: 'size', sec: t('Look'), label: t('Card size: {size}', { size: t({ medium: 'Medium', large: 'Large', huge: 'Huge' }[settings.bigScreenCardSize ?? 'large']) }), run: () => { const o = ['medium', 'large', 'huge'] as const; saveSettings({ bigScreenCardSize: o[(o.indexOf(settings.bigScreenCardSize ?? 'large') + 1) % 3] }); }, cycle: true },
    { icon: 'palette', sec: t('Look'), label: t('Theme: {name}', { name: THEMES[themeIdx].name }), run: () => saveSettings({ theme: THEMES[(themeIdx + 1) % THEMES.length].id }), cycle: true },
    { icon: 'volume', sec: t('Sound'), label: t('Sounds: {name}', { name: settings.soundPack === 'off' ? t('Off') : settings.soundPack[0].toUpperCase() + settings.soundPack.slice(1) }), run: () => { const order = ['lumen', 'crisp', 'bubbly', 'airy', 'off'] as const; saveSettings({ soundPack: order[(order.indexOf(settings.soundPack) + 1) % order.length] }); }, cycle: true },
    { icon: 'music', sec: t('Sound'), label: t('Music: {name}', { name: MUSIC_NAME(settings.music) }), run: () => { const order = ['off', 'shuffle', 'lumen', 'crisp', 'bubbly', 'airy', 'nebula', 'orbit', 'pulsar', 'tides', 'driftwood', ...(settings.musicFile ? ['custom'] : [])] as any[]; saveSettings({ music: order[(order.indexOf(settings.music) + 1) % order.length] }); }, cycle: true },
    { icon: 'settings', sec: t('System'), label: t('All settings…'), run: () => { setMenu(false); setSettingsOut(false); setAllSettings(true); } },
    { icon: 'power', sec: t('System'), label: t('Power…'), run: () => { setMenu(false); setPower(true); } },
    { icon: 'monitor', sec: t('System'), label: t('Exit Big Screen'), run: () => leave() },
  ];

  const clampRow = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows.length - 1, r));
    return { r: rr, c: Math.max(0, Math.min(rows[rr].games.length - 1, c)) };
  };

  const onAction = (a: PadAction) => {
    wakeHints.current();
    if (leaving) return;
    if (power) return; // the power menu handles its own input
    if (allSettings) return; // the settings window takes the controller itself
    if (['up', 'down', 'left', 'right'].includes(a)) playSound('move');
    else if (a === 'a' || a === 'x') playSound('select');
    else if (a === 'b') playSound('back');
    else if (a === 'lb' || a === 'rb' || a === 'start') playSound('open');
    if (search !== null) {
      // The list of hits sits above the keyboard: the bumpers walk it, A opens, X plays.
      if (hits.length && (a === 'lb' || a === 'rb')) { setHitIdx((i) => (i + (a === 'rb' ? 1 : hits.length - 1)) % hits.length); return; }
      if (hits.length && (a === 'y' || a === 'start')) { setSearch(null); setDetail(hits[hitIdx].id); setDetailBtn(0); return; }
      if (keys.action(a)) return;
      if (a === 'x' && hits.length) { launch(hits[hitIdx]); setSearch(null); return; }
      return;
    }
    if (menu) {
      if (a === 'up') setMenuIdx((i) => (i + menuItems.length - 1) % menuItems.length);
      else if (a === 'down') setMenuIdx((i) => (i + 1) % menuItems.length);
      else if (a === 'a' || ((a === 'left' || a === 'right') && menuItems[menuIdx].cycle)) menuItems[menuIdx].run();
      else if (a === 'b' || a === 'start') setMenu(false);
      return;
    }
    if (detailGame) {
      const acts = detailActions;
      const n = acts.length;
      if (a === 'left') setDetailBtn((i) => (i + n - 1) % n);
      else if (a === 'right') setDetailBtn((i) => (i + 1) % n);
      else if (a === 'a') acts[Math.min(detailBtn, n - 1)]?.run();
      else if (a === 'x') { if (!confirmRemove) launch(detailGame); }
      else if (a === 'y') { if (!confirmRemove) update(detailGame.id, { favorite: !detailGame.overrides.favorite }); }
      else if (a === 'b') { if (confirmRemove) { setConfirmRemove(false); setDetailBtn(0); } else setDetail(null); }
      return;
    }
    switch (a) {
      case 'lb': setTab((t) => TABS[(TABS.indexOf(t) + TABS.length - 1) % TABS.length]); return;
      case 'rb': setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]); return;
      case 'start': setMenu(true); setMenuIdx(0); return;
      case 'select': setPower(true); return;
      case 'a': if (focused) { setDetail(focused.id); setDetailBtn(0); } return;
      case 'x': if (focused) launch(focused); return;
      case 'y': setSearch(''); setHitIdx(0); return;
      case 'b':
        // Back from another tab goes Home first; Back on Home opens the menu (settings, power, exit),
        // so a stray press never drops you out of Big Screen.
        if (tab !== TABS[0]) setTab(TABS[0]);
        else { setMenu(true); setMenuIdx(0); }
        return;
    }
    if (useGrid) {
      const cols = columns();
      const n = gridGames.length;
      setPos((p) => {
        let c = p.c;
        if (a === 'left') c = Math.max(0, c - 1);
        if (a === 'right') c = Math.min(n - 1, c + 1);
        if (a === 'up') c = c - cols >= 0 ? c - cols : c;
        if (a === 'down') c = c + cols < n ? c + cols : Math.floor(c / cols) < Math.floor((n - 1) / cols) ? n - 1 : c;
        return { r: 0, c };
      });
    } else {
      setPos((p) => {
        if (a === 'left') return clampRow(p.r, p.c - 1);
        if (a === 'right') return clampRow(p.r, p.c + 1);
        if (a === 'up') return clampRow(p.r - 1, p.c);
        if (a === 'down') return clampRow(p.r + 1, p.c);
        return p;
      });
    }
  };

  usePad(onAction, true, setPad);

  // Mouse wheel and touchpad: up/down moves between rows (or grid lines), sideways or Shift+wheel moves along a row.
  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (detail || menu || power) return;
    const now = performance.now();
    if (now - wheelAt.current < 140) return;
    const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    wheelAt.current = now;
    if (Math.abs(dx) > Math.abs(dy)) onAction(dx > 0 ? 'right' : 'left');
    else onAction(dy > 0 ? 'down' : 'up');
  };

  // The "Photo" look borrows the artwork of the first pick as a dimmed backdrop.
  const vibesArt = settings.vibesStyle === 'photo' ? (mood?.games ?? []).map((g) => heroOf(g) ?? artOf(g).cover).find(Boolean) : undefined;
  const bg = heroOf(detailGame ?? focused);
  const fa = focused ? artOf(focused) : undefined;

  return (
    <>
    {/* The page itself steps aside when settings opens, so the two read as one screen. The
        settings panel is a sibling, not a child, or it would slide away with everything else. */}
    <div className={`bs ${useGrid ? 'bs-grid-mode' : ''} ${booting ? 'booting' : ''} ${allSettings && !settingsOut ? 'bs-aside' : ''} ${settings.padBadges === false ? 'no-pad' : ''}`} data-size={settings.bigScreenCardSize ?? 'large'} onWheel={onWheel}>
      <div className="bs-probe" ref={rowProbe}><i /><b /></div>
      {booting && intro && (
        <div className="bs-boot">
          <div className="bs-boot-glow" />
          <Logo size={150} animate style={settings.logoStyle} />
          <b>{'LUMEN'.split('').map((ch, i) => <i key={i} style={{ animationDelay: `${1.05 + i * 0.09}s` }}>{ch}</i>)}</b>
          <small>{t('All your games, one place')}</small>
        </div>
      )}
      {leaving && (
        <div className="bs-boot bs-outro">
          <div className="bs-boot-glow" />
          <Logo size={150} out style={settings.logoStyle} />
          <b className="gg"><i>G</i><i>G</i></b>
          <small>{t('Good game. See you soon.')}</small>
        </div>
      )}
      <div className={`bs-bg ${settings.bigScreenBackground === 'wallpaper' ? 'wp' : ''}`} aria-hidden>
        {settings.bigScreenBackground === 'wallpaper' ? (
          <Wallpaper kind={settings.background === 'video' && settings.videoFile ? 'video' : settings.wallpaper} video={settings.videoFile} still={settings.reduceMotion} />
        ) : bg && <img key={bg} src={bg} alt="" />}
        <div className="bs-shade" />
      </div>

      <header className="bs-top">
        <div className="bs-brand">
          <div className="bs-brand-name"><Logo size={30} style={settings.logoStyle} /> <span>Lumen</span></div>
          {/* Up to two pads are named here; a full couch would push the header into the artwork,
              so beyond that it is a count, with every name on the icon in the corner. */}
          {padInfo.pads.length > 2
            ? <div className="bs-pad-readout"><Icon name="gamepad" size={16} /> {padInfo.pads.length} controllers</div>
            : padInfo.pads.map((p) => (
              <div key={p.index} className="bs-pad-readout">
                <Icon name="gamepad" size={16} />{padInfo.pads.length > 1 && <b className="pad-num">{p.index}</b>} {p.name}
                {p.battery !== undefined && <Battery percent={p.battery} size={15} />}
              </div>
            ))}
        </div>
        <nav className="bs-tabs">
          <span className="bs-hint-btn">LB</span>
          {TABS.map((name) => <button key={name} className={name === tab ? 'on' : ''} onClick={() => setTab(name)}>{t(name)}</button>)}
          <span className="bs-hint-btn">RB</span>
        </nav>
        <div className="bs-status">
          <span title={padInfo.pads.length ? padInfo.pads.map((p) => `Player ${p.index}: ${p.name}${p.battery === undefined ? '' : ` — battery ${p.battery}%`}`).join('\n') : 'No controller'} className={pad ? 'ok' : 'dim'}>
            <Icon name="gamepad" size={22} />{padInfo.pads.length > 1 && <b className="pad-count">{padInfo.pads.length}</b>}
          </span>
          {padInfo.pads[0]?.battery !== undefined && <Battery percent={padInfo.pads[0].battery!} size={20} />}
          <TempChip />
          {weather?.ok && <span className="bs-weather" title={`${weather.label} in ${weather.place}, feels like ${weather.feels}°`}><Icon name={weatherIcon(weather)} size={22} /> {weather.temp}°</span>}
          {downloads.length > 0 && (
            <span className="bs-dl" title={downloadLabel(downloads[0])}>
              <Icon name="download" size={18} />
              <span className="dl-bar"><i style={{ width: `${downloads[0].percent ?? 4}%` }} className={downloads[0].percent === undefined ? 'wait' : ''} /></span>
              {downloadShort(downloads[0])}{downloads.length > 1 ? ` +${downloads.length - 1}` : ''}
            </span>
          )}
          <span className="bs-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="bs-exit icon" onClick={() => setPower(true)} title={t('Power')}><Icon name="power" size={20} /></button>
          <button className="bs-exit" onClick={leave} title={t('Back to the desktop view')}>
            <Icon name="close" size={20} /> <span>{t('Exit')}</span>
          </button>
        </div>
      </header>

      {!useGrid && mood && (
        <aside className={`bs-vibes v-${settings.vibesStyle ?? 'panel'} ${mood.online ? 'live' : ''}`} style={vibesArt ? ({ ['--vibes-art' as string]: `url("${vibesArt}")` } as CSSProperties) : undefined}>
          <span className="eyebrow"><Icon name={mood.icon ?? (weather ? weatherIcon(weather) : 'sparkle')} size={18} /> {mood.label}</span>
          <h3>{mood.title}</h3>
          {mood.online ? <PulseList kind={mood.online} big /> : <><p>{mood.text}</p><small>Today's picks: {mood.why.toLowerCase()}.</small></>}
        </aside>
      )}

      {!useGrid && focused && fa && (
        <section className="bs-feature">
          {fa.logo ? <img className="bs-logo" src={fa.logo} alt={titleOf(focused)} onError={(e) => (e.currentTarget.style.display = 'none')} /> : <h1>{titleOf(focused)}</h1>}
          {fa.logo && <h2 className="bs-sub">{titleOf(focused)}</h2>}
          <div className="bs-meta">
            <SourceBadge source={focused.source} /> {SOURCES[focused.source].name}
            <span>·</span> {t('Last played')} {timeAgo(lastPlayedOf(focused)).toLowerCase()}
            {minutesOf(focused) > 0 && <><span>·</span> {playtime(minutesOf(focused))} played</>}
            {focused.controller && <><span>·</span><span className={`bs-pad ${focused.controller}`}><Icon name="gamepad" size={18} /> {t(PAD_LABEL[focused.controller])}</span></>}
            {!focused.installed && <><span>·</span><span className="muted">{t('Not installed')}</span></>}
            {focused.overrides.favorite && <><span>·</span><span className="accent">★ {t('Favorite')}</span></>}
          </div>
          <FeatureInfo id={focused.id} />
          {(() => {
            const d = downloads.find((x) => x.gameId === focused.id);
            return d ? (
              <div className={`bs-dlline${downloadWaiting(d.state) ? ' waiting' : ''}`}>
                <Icon name="download" size={18} /> {d.percent !== undefined ? `${d.percent}% · ` : ''}{downloadLabel(d)}
                {downloadWaiting(d.state) && <em>{t('Press A to open it in the launcher')}</em>}
              </div>
            ) : null;
          })()}
        </section>
      )}

      {!visible.length ? (
        <div className="bs-empty">
          <h2>{t('No games yet')}</h2>
          <p>{t('Press Start and choose Scan launchers, or add games from the desktop view.')}</p>
        </div>
      ) : useGrid ? (
        <div className="bs-gridwrap">
          <h3 className="bs-row-title">{tab === 'Home' ? 'Your games' : tab} <span className="muted">{gridGames.length ? `${pos.c + 1} / ${gridGames.length}` : 0}</span></h3>
          {(() => {
            // Only the rows around the selected one are built. Drawing a whole 500-game grid at once
            // overloaded the graphics card and left most of it blank.
            const fr = Math.floor(pos.c / gm.cols);
            const startRow = Math.max(0, fr - 3);
            const start = startRow * gm.cols;
            const end = Math.min(gridGames.length, (fr + 4) * gm.cols);
            // The focused card grows by 8%, so leave that much room above the first row or its top gets cut off.
            const pad = Math.round(gm.cardH * 0.04) + 14;
            const shift = Math.max(0, pad + fr * gm.rowH - (gm.h - gm.cardH) / 2);
            return (
              <div className="bs-grid" ref={gridRef}>
                <div className="bs-probe" ref={probeRef}><i /><b /></div>
                <div className="bs-grid-inner" style={{ gridTemplateColumns: `repeat(${gm.cols}, 1fr)`, paddingTop: pad, transform: `translateY(${-shift}px)` }}>
                  {startRow > 0 && <div className="bs-grid-spacer" style={{ height: startRow * gm.rowH - 30 }} />}
                  {gridGames.slice(start, end).map((g, k) => {
                    const i = start + k;
                    const click = () => { if (i === pos.c) setDetail(g.id); setPos({ r: 0, c: i }); };
                    if (shape === 'landscape') return <WideTile key={g.id} g={g} focused={i === pos.c} badge={settings.showSourceBadges} onClick={click} />;
                    return <Cover key={g.id} g={g} focused={i === pos.c} showTitle={false} showBadge={settings.showSourceBadges} onClick={click} />;
                  })}
                </div>
              </div>
            );
          })()}
          {gridGames.length === 0 && (
            tab === 'Controller'
              ? <p className="muted bs-none">{t('No controller games found yet. Lumen fills this in from the Steam store after a scan.')}</p>
              : tab === 'Emulation'
              ? <p className="muted bs-none">{t('Nothing from Quiver Launcher yet. Install a game in Quiver, then scan again. If Quiver keeps its data in an unusual place, set that folder in Settings, Library.')}</p>
              : <p className="muted bs-none">{t('Nothing here yet. Press {y} on a game to favorite it.', { y: 'Y' })}</p>
          )}
        </div>
      ) : (
        <div className="bs-rows">
          <div className="bs-rows-inner" ref={rowsRef} style={{ transform: `translateY(${-rowShift}px)` }}>
          {rows.map((row, r) => {
            // Only build the cards near where you are: big libraries have thousands of covers,
            // and drawing them all made scrolling stutter and leave blank tiles.
            const near = r >= pos.r - 2 && r <= pos.r + 4;
            const center = r === pos.r ? pos.c : colMem.current[row.id] ?? 0;
            const start = Math.max(0, center - 12);
            const end = Math.min(row.games.length, center + 22);
            return (
              <section key={row.id} className={`bs-row ${row.id === 'recent' ? 'wide' : ''} ${row.id === 'vibes' ? 'vibes-row' : ''} ${r === pos.r ? 'active' : r < pos.r ? 'above' : ''}`}>
                {<h3 className="bs-row-title">{row.name}{r === pos.r && row.games.length > 1 && <span className="muted">{pos.c + 1} / {row.games.length}</span>}</h3>}
                <div className="bs-row-track">
                  {!near ? <div className="bs-placeholder" /> : (
                    <div className="bs-strip" style={{ ['--shift' as any]: row.id === 'recent' ? center : rowShift1(center) }}>
                      {start > 0 && <div className="bs-spacer" style={{ ['--n' as any]: start }} />}
                      {row.games.slice(start, end).map((g, k) => {
                        const c = start + k;
                        const isFocus = r === pos.r && c === pos.c;
                        const click = () => { if (isFocus) setDetail(g.id); setPos({ r, c }); };
                        // The first row works like a console home screen: big landscape tiles.
                        if (row.id === 'recent') return <WideTile key={g.id} g={g} focused={isFocus} badge={settings.showSourceBadges} onClick={click} />;
                        if (shape === 'landscape') return <WideTile key={g.id} g={g} focused={isFocus} badge={settings.showSourceBadges} onClick={click} />;
                        return <Cover key={g.id} g={g} focused={isFocus} showTitle={false} showBadge={settings.showSourceBadges} onClick={click} />;
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
          </div>
        </div>
      )}

      {hintsMode !== 'off' && (
        <footer className={`bs-hints${hintsOn ? '' : ' gone'}`} aria-hidden={!hintsOn}>
          {detailGame ? (
            <><span><b className="bs-hint-btn">A</b> {t('Select')}</span><span><b className="bs-hint-btn">X</b> {t('Play')}</span><span><b className="bs-hint-btn">Y</b> {t('Favorite')}</span><button onClick={() => setDetail(null)}><b className="bs-hint-btn">B</b> {t('Back')}</button></>
          ) : (
            <><span><b className="bs-hint-btn">A</b> {t('Details')}</span><span><b className="bs-hint-btn">X</b> {t('Play')}</span><button onClick={() => { setSearch(''); setHitIdx(0); }}><b className="bs-hint-btn">Y</b> {t('Search')}</button>
              <button onClick={() => { setMenu(true); setMenuIdx(0); }}><b className="bs-hint-btn">B</b> / <b className="bs-hint-btn">Start</b> {t('Menu')}</button>
              <button onClick={() => setPower(true)}><b className="bs-hint-btn">View</b> {t('Power')}</button>
  </>
          )}
        </footer>
      )}

      {detailGame && (
        <div className="bs-detail">
          <div className="bs-detail-card">
            <div className="bs-detail-cover">
              <Cover g={detailGame} />
            </div>
            <div className="bs-detail-info">
              {artOf(detailGame).logo ? <img className="bs-logo" src={artOf(detailGame).logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
              <h1>{titleOf(detailGame)}</h1>
              <div className="bs-meta"><SourceBadge source={detailGame.source} /> {SOURCES[detailGame.source].name}{detailGame.controller && <><span>·</span><span className={`bs-pad ${detailGame.controller}`}><Icon name="gamepad" size={18} /> {t(PAD_LABEL[detailGame.controller])}</span></>}{!detailGame.installed && <><span>·</span> {t('Not installed')}</>}</div>
              <div className="bs-stats">
                <div><span>{t('Last played')}</span><b>{timeAgo(lastPlayedOf(detailGame))}</b></div>
                <div><span>{t('Sessions')}</span><b>{detailGame.overrides.playCount ?? 0}</b></div>
                <div><span>{t('Play time')}</span><b>{playtime(minutesOf(detailGame))}</b></div>
              </div>
              <DetailInfo id={detailGame.id} />
              {detailGame.overrides.notes && <p className="bs-notes">{detailGame.overrides.notes}</p>}
              {confirmRemove && <p className="bs-warn">This takes the game's files off your PC. {SOURCES[detailGame.source].name} does the removing and may ask again. The game stays in your account.</p>}
              <div className="bs-actions">
                {detailActions.map((act, i) => (
                  <button key={act.label} className={`bs-btn ${act.kind ?? ''} ${detailBtn === i ? 'focused' : ''}`} onClick={act.run}>
                    {act.icon}{act.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {search !== null && (
        <div className="bs-search">
          <div className="bs-search-box">
            <Icon name="search" size={26} />
            <span className="bs-search-text">{search || <em>{t('Search your games…')}</em>}</span>
            <span className="bs-search-count">{search.trim() ? t('{n} found', { n: hits.length }) : t('{n} games', { n: visible.length })}</span>
          </div>
          <div className="bs-hits">
            {hits.map((g, i) => (
              <button key={g.id} className={`bs-hit ${i === hitIdx ? 'on' : ''}`} onClick={() => { setSearch(null); setDetail(g.id); setDetailBtn(0); }}>
                <SourceBadge source={g.source} /> <span>{titleOf(g)}</span>
                {!g.installed && <em>{t('Not installed')}</em>}
              </button>
            ))}
            {search.trim() && !hits.length && <p className="muted">{t('Nothing with that name.')} <b className="bs-hint-btn">B</b> {t('Back').toLowerCase()}</p>}
          </div>
          {keysView}
          <div className="bs-search-hints">
            <span><b className="bs-hint-btn">A</b> {t('Type')}</span><span><b className="bs-hint-btn">X</b> {t('Delete')}</span>
            <span><b className="bs-hint-btn">LB</b> / <b className="bs-hint-btn">RB</b> {t('Pick a result')}</span>
            <span><b className="bs-hint-btn">Y</b> {t('Open it')}</span><span><b className="bs-hint-btn">B</b> {t('Close')}</span>
          </div>
        </div>
      )}

      {power && <PowerMenu big onClose={() => setPower(false)} onExitBig={leave} />}
      {menu && (
        <div className="bs-menu-backdrop" onClick={() => setMenu(false)}>
          <div className="bs-menu" onClick={(e) => e.stopPropagation()}>
            <h2>{t('Menu')}</h2>
            <div className="bs-menu-sec">{t('Drive space')}</div>
            <Drives compact counts={driveCounts(library.games)} />
            {settings.tempsOn !== false && <><div className="bs-menu-sec">{t('Temperatures')}</div><Temps showNote /></>}
            {menuItems.map((m, i) => (
              <div key={i} className="bs-menu-row">
                {m.sec && m.sec !== menuItems[i - 1]?.sec && <div className="bs-menu-sec">{m.sec}</div>}
                <button className={`bs-menu-item ${i === menuIdx ? 'focused' : ''}`} onMouseEnter={() => setMenuIdx(i)} onClick={m.run}>
                  <Icon name={m.icon} size={22} /><span>{m.label}</span>{m.cycle && <span className="cyc">‹ ›</span>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    {allSettings && <div className={`bs-settings ${settingsOut ? 'out' : ''}`}><SettingsPanel onClose={closeSettings} tv /></div>}
    </>
  );
}

function DetailInfo({ id }: { id: string }) {
  const info = useGameInfo(id);
  if (info === undefined) return <p className="muted bs-desc">{t('Loading game info…')}</p>;
  if (!info) return <p className="muted bs-desc">{t('No store details found for this game.')}</p>;
  const r = info.reviews;
  return (
    <>
      {info.description && <p className="bs-desc">{info.description}</p>}
      <div className="bs-facts">
        {r?.percent !== undefined && (
          <div><span>{t('Reviews')}</span><b className={r.percent >= 70 ? 'good' : r.percent >= 40 ? 'mixed' : 'bad'}>{r.summary ?? `${r.percent}%`}</b><small>{r.percent}% of {(r.total ?? 0).toLocaleString()}</small></div>
        )}
        {info.price && <div><span>{t('Price')}</span><b>{info.price.final}</b>{info.price.discount ? <small>-{info.price.discount}% from {info.price.initial}</small> : null}</div>}
        {info.currentPlayers !== undefined && <div><span>{t('Playing now')}</span><b>{info.currentPlayers.toLocaleString()}</b></div>}
        {info.releaseDate && <div><span>{t('Released')}</span><b>{info.releaseDate}</b></div>}
        {info.metacritic ? <div><span>{t('Metacritic')}</span><b className="good">{info.metacritic}</b></div> : null}
        {info.developers?.length ? <div><span>{t('Developer')}</span><b>{info.developers.join(', ')}</b></div> : null}
        <div className="bs-ach-fact"><span>{t('Achievements')}</span><Achievements id={id} total={info.achievements} big /></div>
      </div>
      {(info.tags?.length || info.genres?.length) ? (
        <div className="bs-genres">{(info.tags ?? info.genres ?? []).slice(0, 6).map((x) => <span key={x} className="chip on">{x}</span>)}</div>
      ) : null}
      {info.matchedByTitle && <small className="muted">{t('Matched to the Steam store by name, so this may belong to another edition.')}</small>}
    </>
  );
}

/** A short line of store facts under the name of the game you are on. */
function FeatureInfo({ id }: { id: string }) {
  const info = useGameInfo(id);
  if (!info) return null;
  const bits: string[] = [];
  if (info.reviews?.summary) bits.push(`${info.reviews.summary}${info.reviews.percent !== undefined ? ` ${info.reviews.percent}%` : ''}`);
  if (info.currentPlayers) bits.push(`${info.currentPlayers.toLocaleString()} playing now`);
  if (info.price?.final) bits.push(info.price.final);
  if (info.releaseDate) bits.push(info.releaseDate);
  const tags = (info.tags ?? info.genres ?? []).slice(0, 3);
  if (!bits.length && !tags.length) return null;
  return (
    <div className="bs-store">
      {bits.join(' · ')}
      {tags.length ? <span className="bs-store-tags">{tags.map((t) => <span key={t} className="chip on">{t}</span>)}</span> : null}
    </div>
  );
}

/** A landscape tile for the console-style first row: wide artwork with the game's logo or name on it. */
function WideTile({ g, focused, badge, onClick }: { g: Game; focused: boolean; badge: boolean; onClick(): void }) {
  const { settings } = useLumen();
  const a = artOf(g);
  // Wide art first; if a game has none, use the same cover the desktop view shows.
  const chain = useMemo(() => wideChain(g), [g]);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [chain.map((c) => c.url).join('|')]);
  const pick = chain[idx];
  const img = pick?.url;
  return (
    <div className={`card wide cs-${settings?.cardStyle ?? 'classic'} ${focused ? 'focused' : ''} ${g.installed ? '' : 'uninstalled'}`} onClick={onClick} role="button" tabIndex={-1} data-id={g.id}>
      <div className="art">
        {settings?.cardStyle === 'rgb' && <i className="rgb-ring" aria-hidden />}
        {settings?.cardStyle === 'rgb' && <i className="rgb-halo" aria-hidden />}
        {img ? <img src={img} alt="" loading="lazy" decoding="async" draggable={false} className={`in ${pick.cover ? 'blurred' : ''}`} onError={() => setIdx((i) => i + 1)} /> : <FallbackArt g={g} wide bare />}
        <div className="wide-shade" />
        {pick?.cover && <img className="wide-cover" src={img} alt="" draggable={false} />}
        {a.logo ? <img className="wide-logo" src={a.logo} alt="" draggable={false} onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
        <span className={`wide-title ${a.logo ? 'has-logo' : ''}`}>{titleOf(g)}</span>
        {badge && <SourceBadge source={g.source} />}
        <PadBadge g={g} />
        <DownloadOverlay g={g} />
        {!g.installed && <span className="missing-tag">{t('Not installed')}</span>}
      </div>
    </div>
  );
}
