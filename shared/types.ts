export type SourceId =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'ea'
  | 'ubisoft'
  | 'xbox'
  | 'battlenet'
  | 'amazon'
  /** Quiver Launcher: ports, recompilations and fan projects released on GitHub, GitLab and other forges. */
  | 'quiver'
  | 'manual';

export interface LaunchSpec {
  /** "url" opens a protocol link through the owning launcher, "exe" starts a program directly. */
  kind: 'url' | 'exe';
  target: string;
  args?: string[];
  cwd?: string;
}

export interface Artwork {
  cover?: string; // portrait 2:3
  hero?: string; // wide background
  logo?: string; // transparent title logo
  icon?: string;
  /** Other cover images to try, in order, if the main one doesn't load. */
  alts?: string[];
}

/** What a scanner reports for one installed game. */
export interface ScannedGame {
  id: string; // `${source}:${sourceGameId}`
  source: SourceId;
  sourceGameId: string;
  title: string;
  installDir?: string;
  launch: LaunchSpec;
  /** How to install it, for games you own that aren't installed. */
  install?: LaunchSpec;
  art: Artwork;
  /** Play time and last played date reported by the launcher itself. */
  stats?: { minutes?: number; lastPlayed?: number };
  /** Controller support as the Steam store lists it. Missing means not known yet. */
  controller?: PadSupport;
}

export type PadSupport = 'full' | 'partial' | 'none';

/** Things the player changes about a game. These survive rescans. */
export interface GameOverrides {
  title?: string;
  art?: Artwork;
  launch?: LaunchSpec;
  favorite?: boolean;
  hidden?: boolean;
  categories?: string[];
  lastPlayed?: number;
  playCount?: number;
  playMinutes?: number;
  addedAt?: number;
  notes?: string;
}

export interface Game extends ScannedGame {
  overrides: GameOverrides;
  /** True when the latest scan found it installed. */
  installed: boolean;
  /** True when it's in one of your launcher accounts but not installed. */
  owned: boolean;
}

export type DesktopLayout = 'grid' | 'list' | 'shelves';
export type SortKey = 'title' | 'recent' | 'added' | 'playtime' | 'source';

export type CardStyle = 'classic' | 'cd' | 'dvd' | 'flat' | 'frame' | 'glass' | 'neon' | 'rgb' | 'shelf' | 'sticker' | 'tape';
/** The look of the vibes card on Home. 'hidden' leaves it out of both views. */
/** Which mark Lumen draws for itself. All of them animate; the ones with a core light it. */
export type LogoStyle = 'power' | 'orbit' | 'pulse' | 'reactor' | 'spark';

export type VibesStyle = 'panel' | 'soft' | 'outline' | 'glass' | 'bold' | 'photo' | 'hidden';
/** Which mood the vibes card uses. 'auto' rotates through the ones that fit, a day at a time. */
export type VibesMood = 'auto' | 'weather' | 'positive' | 'fresh' | 'comeback' | 'quick' | 'night' | 'morning' | 'deep' | 'news' | 'releases' | 'world';
/** The three moods that read from Steam instead of your own library. */
export type PulseKind = 'news' | 'releases' | 'world';
/** One headline, new release or chart entry shown on the vibes card. */
export interface PulseItem {
  id: string;
  title: string;
  /** A line of plain text under the title, for news. */
  sub?: string;
  /** The game's name and age, or the rank and player count. */
  meta?: string;
  image?: string;
  url: string;
  /** When it was published, for sorting. */
  at?: number;
}

export interface Settings {
  theme: string;
  accent: string; // hex, '' means use theme accent
  background: 'theme' | 'hero' | 'image' | 'live' | 'video';
  wallpaper: WallpaperId;
  videoFile: string;
  bigScreenBackground: 'game' | 'wallpaper';
  soundPack: 'off' | SoundStyle;
  soundVolume: number;
  music: 'off' | MusicId | 'custom';
  musicFile: string;
  musicVolume: number;
  musicWhere: 'bigscreen' | 'everywhere';
  keyBindings: Record<string, string[]>;
  padBindings: Record<string, number[]>;
  shortcuts: Record<string, string>;
  globalBigScreenKey: string;
  confirmPower: boolean;
  /** Scan every launcher automatically when Lumen starts. */
  scanOnStart: boolean;
  /** Gamepad badge on Big Screen tiles for games that support a controller. */
  padBadges: boolean;
  /** Keep Lumen on screen while a launcher installs: its main window is pushed down and Lumen
   *  comes back to the front as soon as the download starts. Windows only. */
  stayInLumen: boolean;
  /** Controller works as a mouse while a launcher window is in front (Windows only). */
  padCursor: boolean;
  /** Minutes of doing nothing before the screensaver starts. 0 turns it off. */
  screensaverMinutes: number;
  screensaverScene: 'shuffle' | 'warp' | 'nebula' | 'planet' | 'comets' | 'galaxy' | 'rings' | 'orbit';
  screensaverWhere: 'bigscreen' | 'everywhere';
  screensaverClock: boolean;
  /** Show weather, news about your games and the Steam charts on the screensaver too. */
  screensaverInfo?: boolean;
  settingsVersion?: number;
  backgroundImage: string;
  backgroundBlur: number; // px
  backgroundDim: number; // 0..1
  layout: DesktopLayout;
  cardSize: number; // px width of a cover card
  cardRadius: number; // px
  showTitles: boolean;
  showSourceBadges: boolean;
  sort: SortKey;
  fontScale: number;
  font: 'theme' | 'inter' | 'rounded' | 'mono' | 'serif';
  density: 'cozy' | 'compact';
  sidebarCollapsed: boolean;
  reduceMotion: boolean;
  startInBigScreen: boolean;
  launchOnStartup: boolean;
  /** Couch mode: start with Windows, straight into full screen Big Screen. */
  couchMode?: boolean;
  /** How menu icons move on hover / selection. */
  iconAnim?: 'lively' | 'pop' | 'draw' | 'spin' | 'off';
  /** What a selected game tile does. */
  cardAnim?: 'full' | 'pop' | 'shine' | 'glow' | 'float' | 'tilt' | 'off';
  animSpeed?: 'slow' | 'normal' | 'fast';
  /** Show CPU, GPU, motherboard and drive temperatures in the sidebar and the Big Screen menu. */
  tempsOn?: boolean;
  /** Play the logo animation when Big Screen starts and exits. Missing counts as on. */
  bigScreenIntro?: boolean;
  /** Which mark Lumen uses for itself, everywhere it shows one. Missing counts as 'power'. */
  logoStyle?: LogoStyle;
  /** The button hints along the bottom of Big Screen: always on, gone once you stop pressing, or never. */
  bigScreenHints?: 'auto' | 'always' | 'off';
  /** Shape of the game tiles everywhere. */
  cardShape?: 'portrait' | 'landscape' | 'square';
  /** How a game tile is drawn: the frame around the artwork, not the animation. */
  cardStyle?: CardStyle;
  /** The look of the vibes card on Home, in both views. */
  vibesStyle?: VibesStyle;
  /** Which mood the vibes card uses, or 'auto' to rotate. */
  vibesMood?: VibesMood;
  /** Language to read game news in: a two letter code, 'auto' for the system's, or 'any'. */
  newsLanguage?: string;
  /** Language for Lumen's own menus and text: a two letter code, or 'auto' for the system's. */
  language?: string;
  /** Big Screen rows: how the row moves as you go sideways. */
  bigScreenFollow?: 'follow' | 'center' | 'page';
  /** Desktop Home: rows that scroll sideways, or rows that wrap onto more lines. */
  homeRows?: 'shelves' | 'wrap';
  /** Show local weather in the header (and let the Weather wallpaper follow it). */
  weatherOn?: boolean;
  /** City to show weather for; empty means detect roughly from the internet connection. */
  weatherCity?: string;
  weatherUnit?: 'c' | 'f';
  /** Desktop sidebar: item order and hidden items/sections. */
  navOrder?: string[];
  navHidden?: string[];
  /** Big Screen tabs: order and hidden tabs. */
  bigTabs?: string[];
  bigTabsHidden?: string[];
  minimizeOnLaunch: boolean;
  bigScreenLayout: 'rows' | 'grid';
  bigScreenCardSize?: 'medium' | 'large' | 'huge';
  /** Which artwork scrapers run after a scan. Missing keys count as on. */
  artSources?: Partial<Record<ArtSourceId, boolean>>;
  bigScreenRows: string[]; // row ids shown on the big-screen home
  enabledSources: Record<SourceId, boolean>;
  steamGridDbKey: string;
  showUninstalled: boolean;
  steamApiKey: string;
  steamId: string;
  ownedSources: { steam: boolean; epic: boolean; galaxy: boolean; amazon: boolean };
  autoFetchArt: boolean;
  customPaths: Partial<Record<SourceId, string>>;
}

export type SoundStyle = 'lumen' | 'crisp' | 'bubbly' | 'airy';
/** Background music pieces. The four sound-pack names are the originals; the rest are the calm space set. */
export type MusicId = SoundStyle | 'nebula' | 'orbit' | 'pulsar' | 'tides' | 'driftwood' | 'shuffle';
export type WallpaperId = 'waves' | 'orbs' | 'tiles' | 'aurora' | 'stars' | 'grid' | 'mesh' | 'bubbles' | 'rain' | 'snow' | 'fireflies' | 'ripples' | 'hills' | 'weather';
export type PowerAction = 'shutdown' | 'restart' | 'sleep' | 'lock' | 'quit';

/** How far the player is through a game's achievements. */
export interface AchievementProgress {
  total: number;
  unlocked: number;
  /** When the most recent one was earned. */
  lastUnlocked?: number;
  /** Ids of the last few earned, newest first. */
  recent?: string[];
}

/** One game the launcher is downloading or installing right now. */
export interface Download {
  gameId: string;
  title: string;
  source: SourceId;
  /** "queued" waits its turn in the launcher, "paused" is stopped there until someone resumes it. */
  state: 'starting' | 'queued' | 'downloading' | 'installing' | 'paused';
  bytes: number;
  total: number;
  percent?: number;
  bytesPerSecond?: number;
  /** Seconds left, when we can work it out. */
  eta?: number;
}

/** One temperature Windows (or a hardware monitor) will tell us about. */
/** A controller's charge, as Windows reports it. */
export interface PadBattery {
  /** The device's name as Windows gives it, e.g. "Xbox Wireless Controller". */
  name: string;
  /** 0 to 100. */
  percent: number;
}

export interface TempReading {
  kind: 'cpu' | 'gpu' | 'board' | 'disk' | 'other';
  /** What the sensor calls itself, e.g. "AMD Ryzen 7 5800X - Core (Tctl/Tdie)". */
  label: string;
  celsius: number;
  /** "monitor" means a hardware monitor the player runs themselves answered, motherboard included. */
  source: 'monitor' | 'windows';
}

export interface GameInfo {
  steamAppId?: number;
  name?: string;
  description?: string;
  developers?: string[];
  publishers?: string[];
  genres?: string[];
  features?: string[];
  releaseDate?: string;
  metacritic?: number;
  screenshots?: string[];
  website?: string;
  /** True when we matched a non-Steam game to a Steam store entry by title. */
  matchedByTitle?: boolean;
  price?: { final?: string; initial?: string; discount?: number; free?: boolean };
  reviews?: { summary?: string; positive?: number; total?: number; percent?: number };
  tags?: string[];
  currentPlayers?: number;
  header?: string;
  platforms?: string[];
  achievements?: number;
  dlcCount?: number;
}

/** One game found by the free store lookup (Explore → Game lookup). */
export interface LookupResult {
  appid: number;
  name: string;
  image?: string;
  price?: string;
}

export type ArtSourceId = 'steamLocal' | 'steamStore' | 'epic' | 'gog' | 'wikipedia' | 'web';

/** A set of artwork for one game from one free source. */
export interface ArtSet {
  store: 'Steam' | 'Epic' | 'GOG' | 'Wikipedia' | 'Web search';
  name: string;
  cover?: string;
  hero?: string;
  logo?: string;
  icon?: string;
}

export type AccountId = 'steam' | 'epic' | 'gog' | 'xbox' | 'battlenet' | 'amazon' | 'ea' | 'ubisoft';
export interface AccountInfo { id: AccountId; signedIn: boolean; name?: string; games?: number; error?: string }

export interface DealItem {
  id: string;
  store: 'steam' | 'epic';
  title: string;
  image?: string;
  url: string;
  price?: string;
  originalPrice?: string;
  discount?: number;
  free?: boolean;
  endsAt?: string;
  upcoming?: boolean;
}
export interface DealSection { id: string; title: string; store: 'steam' | 'epic'; items: DealItem[]; error?: string }

export interface ScanReport {
  source: SourceId;
  found: number;
  owned?: number;
  ownedError?: string;
  error?: string;
  ms: number;
}

export interface LibraryState {
  games: Game[];
  categories: string[];
  lastScan?: number;
  reports: ScanReport[];
}

export interface ArtSearchResult {
  gameId: number;
  name: string;
}

export interface ArtCandidate {
  url: string;
  thumb: string;
  width: number;
  height: number;
}

export interface LumenApi {
  platform: string;
  getLibrary(): Promise<LibraryState>;
  scan(): Promise<LibraryState>;
  launch(id: string): Promise<{ ok: boolean; installing?: boolean; openedDownloads?: boolean; error?: string; missingLauncher?: string }>;
  /** Starts the game's own uninstaller. Lumen never deletes files itself. */
  uninstall(id: string): Promise<{ ok: boolean; started?: boolean; opened?: boolean; error?: string; missingLauncher?: string }>;
  /** Your own achievement progress for a game, when Steam will tell us. */
  achievements(id: string): Promise<AchievementProgress | undefined>;
  updateGame(id: string, patch: GameOverrides): Promise<Game | undefined>;
  addManualGame(input: { title: string; exe: string; args?: string; cwd?: string }): Promise<Game>;
  removeGame(id: string): Promise<void>;
  setCategories(categories: string[]): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  pickFile(kind: 'image' | 'exe' | 'audio' | 'video'): Promise<string | undefined>;
  power(action: PowerAction): Promise<{ ok: boolean; error?: string }>;
  gameInfo(id: string, refresh?: boolean): Promise<GameInfo | null>;
  setGlobalShortcut(accel: string): Promise<boolean>;
  launcherIcons(): Promise<Partial<Record<SourceId, string>>>;
  accounts(): Promise<AccountInfo[]>;
  signIn(id: AccountId): Promise<{ ok: boolean; accounts: AccountInfo[]; error?: string }>;
  signOut(id: AccountId): Promise<AccountInfo[]>;
  deals(refresh?: boolean): Promise<DealSection[]>;
  /** News, new releases or the worldwide most played chart, for the vibes card. */
  pulse(kind: PulseKind, refresh?: boolean): Promise<PulseItem[]>;
  importArt(filePath: string): Promise<string>;
  searchArt(query: string): Promise<ArtSearchResult[]>;
  listArt(gameId: number, kind: 'cover' | 'hero' | 'logo'): Promise<ArtCandidate[]>;
  freeArt(query: string): Promise<ArtSet[]>;
  fixArt(): Promise<{ missingBefore: number; missingAfter: number }>;
  lookup(query: string): Promise<LookupResult[]>;
  lookupDetails(appid: number): Promise<GameInfo | null>;
  saveText(defaultName: string, content: string): Promise<boolean>;
  openFolder(path: string): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  weather(force?: boolean): Promise<WeatherInfo>;
  /** Every drive Windows can see, with how much room is left on it. */
  drives(refresh?: boolean): Promise<DriveInfo[]>;
  /** CPU, graphics card, motherboard and drive temperatures, and a line saying why there are none. */
  temps(refresh?: boolean): Promise<{ list: TempReading[]; note?: string }>;
  /** What each controller Windows knows the charge of has left. Empty when it knows none. */
  padBattery(refresh?: boolean): Promise<PadBattery[]>;
  downloads(): Promise<Download[]>;
  clearDownload(gameId: string): Promise<void>;
  /** Opens the launcher's own downloads list, so a queued or paused install can be resumed there. */
  openDownloads(source: SourceId): Promise<{ ok: boolean; missingLauncher?: string; error?: string }>;
  /** The name Lumen would show for that launcher's downloads list, when it has one. */
  downloadsLauncher(source: SourceId): Promise<string | undefined>;
  /** Tells the app when Big Screen is on screen, so launcher windows can be driven with the controller. */
  bigScreenActive(on: boolean): Promise<void>;
  onDownloads(cb: (d: Download[]) => void): () => void;
  couchStatus(): Promise<CouchStatus>;
  couchSetup(on: boolean): Promise<CouchStatus>;
  couchOpen(what: 'anyfse' | 'openAnyFse' | 'omniconsole' | 'fseTool' | 'openFseTool' | 'gaming' | 'copyPath' | 'copyArg' | 'copyLink'): Promise<void>;
  quit(): Promise<void>;
  onLibraryChanged(cb: (state: LibraryState) => void): () => void;
  onToggleBigScreen(cb: () => void): () => void;
}

export interface CouchStatus {
  enabled: boolean;
  /** Full path of Lumen.exe, for tools that start it. */
  exe: string;
  arg: string;
  link: string;
  linkRegistered: boolean;
  /** null when it can't be checked (not Windows). */
  omniConsole: boolean | null;
  /** AnyFSE is installed: the bridge that can take Lumen as a custom executable. */
  anyFse: boolean | null;
  anyFseCanOpen: boolean;
  windowsBuild: number;
  windowsRevision: number;
  /** Xbox Full Screen Experience Tool is installed (it unlocks 'Choose home app' on normal PCs). */
  fseTool: boolean;
  fseToolCanOpen: boolean;
  /** Windows 11 24H2 or newer, which Xbox mode (FSE) needs. */
  fseCapable: boolean;
}

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
/** One drive, as Windows reports it. Sizes are in bytes. */
export interface DriveInfo {
  letter: string; // "C:"
  label: string; // the volume name, often empty
  total: number;
  free: number;
  removable: boolean;
}

export interface WeatherInfo {
  ok: boolean;
  error?: string;
  place?: string;
  temp?: number;
  feels?: number;
  wind?: number;
  unit?: 'c' | 'f';
  isDay?: boolean;
  kind?: WeatherKind;
  label?: string;
  at?: number;
}
