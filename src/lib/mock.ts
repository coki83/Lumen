import { DEFAULT_KEYS, DEFAULT_PAD, DEFAULT_SHORTCUTS } from '../../shared/bindings';
// Browser-only stand-in for the Electron bridge, so the UI can be developed and previewed with `npm run dev:web`.
import type { Download, AccountInfo, Game, LibraryState, LumenApi, Settings, SourceId } from '../../shared/types';

const DEFAULTS: Settings = {
  theme: 'ember', accent: '', background: 'hero',
  wallpaper: 'waves',
  videoFile: '',
  bigScreenBackground: 'game',
  soundPack: 'lumen',
  soundVolume: 0.5,
  music: 'off',
  musicFile: '',
  musicVolume: 0.35,
  musicWhere: 'bigscreen',
  keyBindings: { ...DEFAULT_KEYS },
  padBindings: { ...DEFAULT_PAD },
  shortcuts: { ...DEFAULT_SHORTCUTS },
  globalBigScreenKey: '',
  confirmPower: true,
  scanOnStart: true,
  voice: false,
  voiceLaunch: true,
  voiceFeedback: true,
  stayInLumen: true,
  padBadges: true,
  padCursor: true,
  screensaverMinutes: 3, screensaverInfo: true,
  screensaverScene: 'shuffle',
  screensaverWhere: 'bigscreen',
  screensaverClock: true,
 backgroundImage: '', backgroundBlur: 40, backgroundDim: 0.7,
  layout: 'grid', cardSize: 180, cardRadius: 12, cardStyle: 'classic', logoStyle: 'power', vibesStyle: 'panel', vibesMood: 'auto', newsLanguage: 'auto', language: 'auto', showTitles: true, showSourceBadges: true, sort: 'playtime', fontScale: 1,
  font: 'theme', density: 'cozy', sidebarCollapsed: false, reduceMotion: false, startInBigScreen: false, launchOnStartup: false,
  minimizeOnLaunch: true, bigScreenLayout: 'rows', bigScreenRows: ['recent', 'favorites', 'all', 'sources'],
  enabledSources: { steam: true, epic: true, gog: true, ea: true, ubisoft: true, xbox: true, battlenet: true, amazon: true, quiver: true, manual: true },
  steamGridDbKey: '',
  showUninstalled: true,
  steamApiKey: '',
  steamId: '',
  ownedSources: { steam: true, epic: true, galaxy: true, amazon: true }, autoFetchArt: true, customPaths: {}
};

const SAMPLE: [SourceId, string][] = [
  ['steam', 'Hollow Orbit'], ['steam', 'Cinder Roads'], ['steam', 'Tidebreaker'], ['steam', 'Paper Kingdoms'], ['steam', 'Neon Drift 2088'],
  ['steam', 'The Quiet Lighthouse'], ['epic', 'Glasswing'], ['epic', 'Ironvale Tactics'], ['epic', 'Starfall Couriers'], ['gog', 'Moonlit Archive'],
  ['gog', 'Brass & Bramble'], ['ea', 'Velocity Circuit'], ['ea', 'Frontline Echo'], ['ubisoft', 'Crown of Ash'], ['ubisoft', 'Harbor Nights'],
  ['xbox', 'Skyward Farm'], ['xbox', 'Deepwater Station'], ['battlenet', 'Riftguard'], ['amazon', 'Lantern Keep'], ['manual', 'Retro Pocket Emulator'],
  ['steam', 'Saltmarsh Saga'], ['epic', 'Orbital Bakery'], ['gog', 'Wyrmwood'], ['ubisoft', 'Lowtide Heist'],
  ['quiver', 'Clocktower 64 Recompiled'], ['quiver', 'Sunken Realm Port'], ['quiver', 'Pixel Racer Decompiled']
];

function makeGames(): Game[] {
  const now = Date.now();
  // ?many=300 in the preview URL makes a big library for testing scrolling
  const many = Number(new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('many')) || 0;
  // ?covers=1 gives every second game a cover and no wide art, to test fallbacks
  const testCovers = typeof location !== 'undefined' && new URLSearchParams(location.search).has('covers');
  const sample: [SourceId, string][] = many ? Array.from({ length: many }, (_, i) => [SAMPLE[i % SAMPLE.length][0], `${SAMPLE[i % SAMPLE.length][1]} ${Math.floor(i / SAMPLE.length) || ''}`.trim()]) : SAMPLE;
  return sample.map(([source, title], i) => ({
    id: `${source}:${i}`,
    source,
    sourceGameId: String(i),
    title,
    installDir: `C:\\Games\\${title.replace(/[^\w]+/g, '')}`,
    launch: { kind: 'url', target: `${source}://launch/${i}` },
    art: testCovers && i % 2 === 0 ? { cover: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 900'><rect width='600' height='900' fill='hsl(${i * 47} 60% 40%)'/><circle cx='300' cy='380' r='180' fill='hsl(${i * 47 + 60} 80% 65%)'/><text x='300' y='760' font-size='64' fill='white' text-anchor='middle' font-family='sans-serif'>COVER</text></svg>`)}` } : {},
    controller: (['full', 'full', 'partial', 'none', undefined] as const)[i % 5],
    installed: i !== 12 && i < 20,
    owned: true,
    install: { kind: 'url', target: `${source}://install/${i}` },
    overrides: {
      addedAt: now - i * 86400000,
      lastPlayed: i % 3 === 0 && i < 20 ? now - i * 3600000 * 5 : undefined,
      playCount: i % 3 === 0 ? 3 + i : 0,
      playMinutes: i % 3 === 0 ? 40 * (i + 1) : 0,
      favorite: [1, 4, 9, 15].includes(i),
      categories: i % 4 === 0 ? ['Co-op'] : i % 5 === 0 ? ['Backlog'] : []
    }
  }));
}

const fakeVoice = typeof location !== 'undefined' && new URLSearchParams(location.search).has('voice');

export function createMockApi(): LumenApi {
  const accts: AccountInfo[] = (['steam', 'epic', 'gog', 'xbox', 'battlenet', 'amazon', 'ea', 'ubisoft'] as const).map((id) => ({ id, signedIn: false }));
  let settings: Settings = { ...DEFAULTS };
  try {
    settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('lumen.settings') ?? '{}') };
  } catch {}
  let state: LibraryState = { games: makeGames(), categories: ['Co-op', 'Backlog', 'Finished'], lastScan: Date.now(), reports: [] };
  const listeners = new Set<(s: LibraryState) => void>();
  const emit = () => listeners.forEach((l) => l(structuredClone(state)));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    platform: 'web',
    getLibrary: async () => structuredClone(state),
    scan: async () => {
      await wait(700);
      state.lastScan = Date.now();
      state.reports = (['steam', 'epic', 'gog', 'ea', 'ubisoft', 'xbox', 'battlenet', 'amazon'] as SourceId[]).map((s) => ({
        source: s, found: state.games.filter((g) => g.source === s).length, ms: 40
      }));
      return structuredClone(state);
    },
    achievements: async (id) => {
      // The browser has no Steam account, so a believable number is made up from the game id.
      const g = state.games.find((x) => x.id === id);
      if (!g || g.source !== 'steam') return undefined;
      const total = 12 + (g.id.length * 7) % 40;
      return { total, unlocked: Math.round(total * (((g.id.charCodeAt(6) || 3) % 10) / 10)), lastUnlocked: Date.now() - 86400000 };
    },
    uninstall: async (id) => {
      // In the browser there is no launcher to run, so pretend it worked and drop the game.
      const g = state.games.find((x) => x.id === id);
      if (g) { g.installed = false; g.owned = true; }
      emit();
      return { ok: true, started: true };
    },
    launch: async (id) => {
      const g = state.games.find((x) => x.id === id);
      if (g && !g.installed) return { ok: true, installing: true };
      if (g) g.overrides = { ...g.overrides, lastPlayed: Date.now(), playCount: (g.overrides.playCount ?? 0) + 1 };
      emit();
      return { ok: true };
    },
    updateGame: async (id, patch) => {
      const g = state.games.find((x) => x.id === id);
      if (!g) return undefined;
      g.overrides = { ...g.overrides, ...patch, art: { ...(g.overrides.art ?? {}), ...(patch.art ?? {}) } };
      for (const c of patch.categories ?? []) if (!state.categories.includes(c)) state.categories.push(c);
      emit();
      return structuredClone(g);
    },
    addManualGame: async (input) => {
      const g: Game = {
        id: `manual:${Date.now()}`, source: 'manual', sourceGameId: String(Date.now()), title: input.title,
        launch: { kind: 'exe', target: input.exe }, art: {}, installed: true, owned: true, overrides: { addedAt: Date.now() }
      };
      state.games.push(g);
      emit();
      return g;
    },
    removeGame: async (id) => {
      state.games = state.games.filter((g) => g.id !== id);
      emit();
    },
    setCategories: async (c) => {
      state.categories = c;
      emit();
    },
    getSettings: async () => ({ ...settings }),
    saveSettings: async (p) => {
      settings = { ...settings, ...p };
      try { localStorage.setItem('lumen.settings', JSON.stringify(settings)); } catch {}
      return { ...settings };
    },
    pickFile: async () => undefined,
    importArt: async (f) => f,
    searchArt: async () => { throw new Error('Artwork search runs in the desktop app.'); },
    listArt: async () => [],
    freeArt: async (q) => [
      { store: 'Steam', name: q },
      { store: 'Epic', name: q },
      { store: 'GOG', name: q }
    ],
    fixArt: async () => ({ missingBefore: 3, missingAfter: 0 }),
    lookup: async (q) => [1, 2, 3, 4, 5].map((i) => ({ appid: 1000 + i, name: `${q} ${i === 1 ? '' : 'Part ' + i}`.trim(), price: i === 3 ? 'Free' : `${(i * 7.99).toFixed(2)} USD` })),
    lookupDetails: async (id) => ({
      steamAppId: id, name: `Sample game ${id}`, description: 'In the app this comes from the live Steam store page.', developers: ['Sample Studio'], publishers: ['Sample Publishing'],
      releaseDate: '3 Feb 2025', metacritic: 81, genres: ['Action'], tags: ['Roguelite', 'Co-op', 'Pixel Graphics', 'Difficult'],
      price: { final: '$14.99', initial: '$24.99', discount: 40 }, reviews: { summary: 'Mostly Positive', positive: 3100, total: 4100, percent: 76 }, currentPlayers: 5290, platforms: ['Windows'], dlcCount: 3
    }),
    saveText: async () => true,
    openFolder: async () => undefined,
    power: async (a) => (a === 'quit' ? { ok: true } : { ok: false, error: 'Power options work in the desktop app' }),
    gameInfo: async (id) => {
      const g = state.games.find((x) => x.id === id);
      if (!g) return null;
      return {
        steamAppId: 400, name: g.title, matchedByTitle: g.source !== 'steam',
        description: `${g.title} is a sample game used to preview Lumen in a browser. In the app, this text comes from the game's Steam store page.`,
        developers: ['Sample Studio'], publishers: ['Sample Publishing'], genres: ['Adventure', 'Indie'], features: ['Single-player', 'Controller support', 'Steam Cloud'],
        releaseDate: '12 Mar 2024', metacritic: 84, screenshots: [],
        price: { final: '$9.99', initial: '$19.99', discount: 50 }, reviews: { summary: 'Very Positive', positive: 9120, total: 10240, percent: 89 },
        currentPlayers: 1834, tags: ['Adventure', 'Exploration', 'Atmospheric', 'Puzzle', 'Indie', 'Great Soundtrack'], platforms: ['Windows', 'Linux'], achievements: 32
      };
    },
    setGlobalShortcut: async () => true,
    launcherIcons: async () => ({
      // preview stand-in for the real launcher icon the app reads from steam.exe
      steam: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1b2838"/><circle cx="40" cy="24" r="9" fill="none" stroke="#fff" stroke-width="5"/><circle cx="22" cy="42" r="7" fill="#fff"/></svg>')
    }),
    accounts: async () => accts.map((a) => ({ ...a })),
    signIn: async (id) => {
      const a = accts.find((x) => x.id === id)!;
      Object.assign(a, { signedIn: true, name: 'player_one', games: 142 });
      return { ok: true, accounts: accts.map((x) => ({ ...x })) };
    },
    signOut: async (id) => {
      Object.assign(accts.find((x) => x.id === id)!, { signedIn: false, name: undefined, games: undefined });
      return accts.map((x) => ({ ...x }));
    },
    pulse: async (kind) => {
      // No network in the browser mock, so these stand in for what Steam would send.
      await wait(250);
      const titles = SAMPLE.map(([, t]) => t);
      if (kind === 'news') {
        const press = ['Eurogamer', 'PC Gamer', 'Rock Paper Shotgun', 'The Verge', 'Polygon', 'Ars Technica'];
        return titles.slice(0, 6).map((t, i) => ({
          id: `news:${i}`, title: [`${t} lands with full controller support`, `${t} delayed into next spring`, `A new season starts in ${t}`][i % 3],
          meta: `${press[i % press.length]} \u00b7 ${i + 1} ${i === 0 ? 'hour' : 'hours'} ago`, url: 'https://news.google.com/', at: Date.now() - i * 3600000
        }));
      }
      if (kind === 'releases') {
        return titles.slice(2, 10).map((t, i) => ({ id: `new:${i}`, title: t, meta: i % 4 === 0 ? 'Free to play' : undefined, url: 'https://store.steampowered.com/' }));
      }
      return titles.slice(0, 10).map((t, i) => ({
        id: `world:${i}`, title: t, meta: `#${i + 1} \u00b7 ${(900 - i * 73).toLocaleString()}k playing`, url: 'https://store.steampowered.com/'
      }));
    },
    deals: async () => {
      await wait(300);
      const mk = (store: 'steam' | 'epic', n: number, sale: boolean, free = false) =>
        Array.from({ length: n }, (_, i) => ({
          id: store === "steam" && !free ? `steam:${1000 + i + (sale ? 0 : 50)}` : `${store}:${i}:${sale}:${free}`, store, title: SAMPLE[(i * 3 + (sale ? 1 : 0)) % SAMPLE.length][1], url: 'https://store.example/', 
          price: free ? 'Free' : `$${(9.99 + i * 5).toFixed(2)}`, originalPrice: sale || free ? `$${(19.99 + i * 5).toFixed(2)}` : undefined,
          discount: sale ? [75, 50, 33, 60, 20, 90][i % 6] : undefined, free, endsAt: new Date(Date.now() + (i + 2) * 86400000).toISOString()
        }));
      return [
        { id: 'epic-free', title: 'Free on Epic', store: 'epic', items: mk('epic', 2, false, true) },
        { id: 'steam-specials', title: 'On sale on Steam', store: 'steam', items: mk('steam', 10, true) },
        { id: 'epic-sale', title: 'On sale on Epic', store: 'epic', items: mk('epic', 8, true) },
        { id: 'steam-top', title: 'Top sellers on Steam', store: 'steam', items: mk('steam', 10, false) },
        { id: 'epic-top', title: 'Top sellers on Epic', store: 'epic', items: [], error: 'Epic returned 403' }
      ];
    },
    onToggleBigScreen: () => () => undefined,
    setFullscreen: async (on) => {
      try { on ? await document.documentElement.requestFullscreen() : await document.exitFullscreen(); } catch {}
    },
    downloads: async () => mockDownloads(),
    clearDownload: async () => undefined,
    openDownloads: async () => ({ ok: true }),
    downloadsLauncher: async () => 'Steam',
    bigScreenActive: async () => undefined,
    onDownloads: (cb: (d: any[]) => void) => {
      const t = setInterval(() => cb(mockDownloads()), 1000);
      return () => clearInterval(t);
    },
    // ?battery=N pretends Windows reports that charge for the pad; ?battery=none reports nothing.
    padBattery: async () => {
      const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('battery');
      if (!q || q === 'none') return [];
      const percent = Math.max(0, Math.min(100, Number(q) || 0));
      return [{ name: 'Xbox Wireless Controller', percent }];
    },
    temps: async () => {
      // ?sensors=none stands in for a PC Windows answers nothing about, so the empty state and the
      // line it shows can be seen in the preview. ?sensors=windows is a PC with no hardware monitor
      // running, which is what most desktops look like: a graphics card and the drives, no more.
      const mode = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('sensors') ?? '';
      if (mode === 'none') {
        return {
          list: [] as any,
          note: 'This PC reports no temperature that Windows can read on its own. Desktop boards usually keep the CPU and motherboard sensors behind a driver, and Windows has no way in; a graphics card answers through the NVIDIA driver and a drive through its own counters, and neither answered here.'
        };
      }
      if (mode === 'windows') {
        return {
          list: [
            { kind: 'gpu', label: 'NVIDIA GeForce RTX 3060', celsius: 61 + Math.round(Math.cos(Date.now() / 11000) * 5), source: 'windows' },
            { kind: 'disk', label: 'Samples NVMe 1TB', celsius: 44, source: 'windows' },
            { kind: 'disk', label: 'Backup HDD 4TB', celsius: 33, source: 'windows' }
          ] as any
        };
      }
      return {
        list: [
          { kind: 'cpu', label: 'Sample CPU - Core (Tctl/Tdie)', celsius: 52 + Math.round(Math.sin(Date.now() / 9000) * 6), source: 'monitor' },
          { kind: 'cpu', label: 'Sample CPU - CCD1', celsius: 48, source: 'monitor' },
          { kind: 'gpu', label: 'Sample GPU - Core', celsius: 61 + Math.round(Math.cos(Date.now() / 11000) * 5), source: 'monitor' },
          { kind: 'board', label: 'Mainboard - System', celsius: 36, source: 'monitor' },
          { kind: 'disk', label: 'Samples NVMe 1TB', celsius: 44, source: 'monitor' },
          { kind: 'disk', label: 'Backup HDD 4TB', celsius: 33, source: 'monitor' }
        ] as any
      };
    },
    drives: async () => [
      { letter: 'C:', label: 'Windows', total: 1000 * 1024 ** 3, free: 184 * 1024 ** 3, removable: false },
      { letter: 'D:', label: 'Games', total: 4000 * 1024 ** 3, free: 1260 * 1024 ** 3, removable: false },
      { letter: 'E:', label: 'Backup', total: 500 * 1024 ** 3, free: 22 * 1024 ** 3, removable: false }
    ],
    weather: async () => ({ ok: true, place: settings.weatherCity || 'Berlin, DE', temp: 7, feels: 4, wind: 14, unit: settings.weatherUnit ?? 'c', isDay: false, kind: 'rain' as const, label: 'Rain', at: Date.now() }),
    couchStatus: async () => ({ enabled: !!settings.couchMode, exe: 'C:\\Games\\Lumen\\Lumen.exe', arg: '--bigscreen', link: 'lumen://bigscreen', linkRegistered: !!settings.couchMode, omniConsole: false, anyFse: false, anyFseCanOpen: false, windowsBuild: 26100, windowsRevision: 8328, fseTool: false, fseToolCanOpen: false, fseCapable: true }),
    couchSetup: async (on) => { settings = { ...settings, couchMode: on, startInBigScreen: on, launchOnStartup: on }; return { enabled: on, exe: 'C:\\Games\\Lumen\\Lumen.exe', arg: '--bigscreen', link: 'lumen://bigscreen', linkRegistered: on, omniConsole: false, anyFse: false, anyFseCanOpen: false, windowsBuild: 26100, windowsRevision: 8328, fseTool: false, fseToolCanOpen: false, fseCapable: true }; },
    couchOpen: async () => undefined,
    // The browser has no recogniser, so voice reads as unsupported. ?voice=1 pretends it is
    // listening and says something every few seconds, which is how the pill gets looked at here.
    voiceStart: async () => ({ supported: fakeVoice, listening: fakeVoice, error: fakeVoice ? null : 'Voice control needs Windows.' }),
    voiceStop: async () => ({ supported: fakeVoice, listening: false, error: null }),
    voiceState: async () => ({ supported: fakeVoice, listening: fakeVoice, error: null }),
    onVoice: (cb) => {
      if (!fakeVoice) return () => undefined;
      const said = ['big screen', 'library', 'play hollow orbit', 'make me a sandwich'];
      let i = 0;
      const h = setInterval(() => cb(`ok lumen ${said[i++ % said.length]}`), 5000);
      return () => clearInterval(h);
    },
    onVoiceState: (cb) => {
      if (!fakeVoice) return () => undefined;
      const h = setTimeout(() => cb({ supported: true, listening: true, error: null }), 300);
      return () => clearTimeout(h);
    },
    quit: async () => undefined,
    onLibraryChanged: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}


// A pretend download so the progress bars can be seen in the browser preview (?dl=1).
const DL_START = Date.now();
function mockDownloads(): Download[] {
  if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('dl')) return [];
  const total = 42_000_000_000;
  const bytes = Math.min(total, ((Date.now() - DL_START) / 1000) * 90_000_000);
  const rate = 90_000_000;
  return [
    { gameId: 'steam:3', title: 'Paper Kingdoms', source: 'steam', state: 'downloading', bytes, total, percent: Math.round((bytes / total) * 100), bytesPerSecond: rate, eta: Math.round((total - bytes) / rate) },
    { gameId: 'epic:7', title: 'Glasswing', source: 'epic', state: 'queued', bytes: 0, total: 8_000_000_000, percent: 0 },
    { gameId: 'steam:11', title: 'Vale of Kites', source: 'steam', state: 'paused', bytes: 3_200_000_000, total: 20_000_000_000, percent: 16 },
    // A stale copy of the same game, the way Steam leaves an old appmanifest in another library.
    // The UI must still show one row for it.
    { gameId: 'steam:3', title: 'Paper Kingdoms', source: 'steam', state: 'installing', bytes: 0, total: 9_000_000, percent: 0 }
  ];
}
