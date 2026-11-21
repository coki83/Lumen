import type { CSSProperties } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { APP_SHORTCUTS, DEFAULT_KEYS, DEFAULT_PAD, DEFAULT_SHORTCUTS, PAD_ACTIONS, PAD_ACTION_LABELS, PAD_BUTTON_NAMES, comboFromEvent, keyLabel, type AppShortcutId, type PadActionId } from '../../shared/bindings';
import { WALLPAPERS, Wallpaper } from '../components/Wallpaper';
import { capturePadButton } from '../lib/gamepad';
import { playSound } from '../lib/sound';
import type { AccountId, AccountInfo, ArtSourceId, CouchStatus, LogoStyle, Settings, SourceId, VoiceState } from '../../shared/types';
import { Icon, Logo } from '../components/Icon';
import { Drives, driveCounts } from '../components/Drives';
import { Temps } from '../components/Temps';
import { SAVERS } from '../components/Screensaver';
import { Cover, SourceBadge, heroOf } from '../components/Cover';
import { artOf } from '../lib/library';
import { Modal, Segmented, Slider, Toggle } from '../components/ui';
import { VOICE_COMMANDS } from '../../shared/voice';
import { api, isDesktop } from '../lib/api';
import { LANGS, coverage, t as tx } from '../lib/i18n';
import { SOURCES, SOURCE_ORDER } from '../lib/sources';
import { BIG_TABS, NAV_ITEMS, NAV_SECTIONS, ordered } from '../lib/nav';
import { refreshWeather, useWeather, weatherIcon } from '../lib/weather';
import { useLumen } from '../lib/store';
import { ACCENT_SWATCHES, THEMES } from '../lib/themes';

const TABS = [
  { id: 'look', label: 'Appearance', icon: 'palette' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'accounts', label: 'Accounts', icon: 'lock' },
  { id: 'sources', label: 'Launchers', icon: 'refresh' },
  { id: 'sound', label: 'Sound & music', icon: 'music' },
  { id: 'controls', label: 'Controls', icon: 'keyboard' },
  { id: 'big', label: 'Big Screen', icon: 'tv' },
  { id: 'menus', label: 'Menus & weather', icon: 'list' },
  { id: 'art', label: 'Artwork', icon: 'image' },
  { id: 'general', label: 'General', icon: 'settings' }
] as const;

export const BIG_ROWS: { id: string; label: string }[] = [
  { id: 'recent', label: 'Continue playing' },
  { id: 'mostPlayed', label: 'Most played' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'all', label: 'All games' },
  { id: 'collections', label: 'Collections (one row each)' },
  { id: 'sources', label: 'Launchers (one row each)' },
  { id: 'added', label: 'Recently added' }
];

/**
 * True while Settings is open inside Big Screen. A TV has no sidebar, no window and no keyboard,
 * so the rows that only shape the desktop view are noise there and are left out.
 */
const TvMode = createContext(false);
const useTv = () => useContext(TvMode);

export function SettingsPanel({ onClose, tv = false }: { onClose(): void; tv?: boolean }) {
  const { settings: s, saveSettings, library, scan, scanning } = useLumen();
  const acc = useAccounts();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>(tv ? 'big' : 'look');
  const set = (p: Partial<Settings>) => saveSettings(p);
  // On a TV the Big Screen page is what you came for, so it leads.
  const tabs = tv ? [...TABS].sort((a, b) => Number(b.id === 'big') - Number(a.id === 'big')) : TABS;

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <TvMode.Provider value={tv}>
      <div className="settings">
        <nav className="settings-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`nav-item ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} /> <span>{tx(t.label)}</span>
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'look' && (
            <>
              <h4>Theme</h4>
              <div className="themes">
                {THEMES.map((t) => (
                  <button key={t.id} className={`theme-card ${s.theme === t.id ? 'on' : ''}`} onClick={() => set({ theme: t.id })}
                    style={{ background: `linear-gradient(135deg, ${t.vars.bg}, ${t.vars.bg2})`, color: t.vars.text }}>
                    <span className="tc-bars"><i style={{ background: t.vars.accent }} /><i style={{ background: t.vars.panel2 }} /><i style={{ background: t.vars.panel2 }} /></span>
                    <span className="tc-name">{t.name}</span>
                  </button>
                ))}
              </div>
              <h4>Accent color</h4>
              <div className="swatches">
                <button className={`swatch auto ${!s.accent ? 'on' : ''}`} onClick={() => set({ accent: '' })} title="Theme default">Auto</button>
                {ACCENT_SWATCHES.map((c) => <button key={c} className={`swatch ${s.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={c} />)}
                <label className="swatch custom" title="Pick any color"><input type="color" value={s.accent || '#ff8a3d'} onChange={(e) => set({ accent: e.target.value })} /></label>
              </div>
              <LogoPicker />
              <h4>Text</h4>
              <label className="row"><span className="lbl">Font</span>
                <select className="select" value={s.font} onChange={(e) => set({ font: e.target.value as Settings['font'] })}>
                  <option value="theme">Theme default</option><option value="inter">Clean sans</option><option value="rounded">Rounded</option><option value="serif">Serif</option><option value="mono">Monospace</option>
                </select>
              </label>
              <Slider label="Text size" value={s.fontScale} min={0.85} max={1.3} step={0.05} onChange={(v) => set({ fontScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <label className="row"><span className="lbl">Density</span>
                <Segmented value={s.density} onChange={(v) => set({ density: v })} options={[{ value: 'cozy', label: 'Cozy' }, { value: 'compact', label: 'Compact' }]} />
              </label>
              <Slider label="Corner roundness" value={s.cardRadius} min={0} max={24} onChange={(v) => set({ cardRadius: v })} format={(v) => `${v}px`} />
              <h4>{tv ? 'Live wallpaper' : 'Background'}</h4>
              {tv && <p className="hint">Big Screen uses this wallpaper when its background is set to Wallpaper, on the Big Screen page. The desktop window's own background is set from the desktop view.</p>}
              {!tv && <label className="row"><span className="lbl">Behind the library</span>
                <Segmented value={s.background} onChange={(v) => set({ background: v })} options={[{ value: 'theme', label: 'Theme' }, { value: 'hero', label: 'Game art' }, { value: 'live', label: 'Live' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }]} />
              </label>}
              {!tv && s.background === 'image' && (
                <div className="inline">
                  <input value={s.backgroundImage} onChange={(e) => set({ backgroundImage: e.target.value })} placeholder="Image URL" />
                  {isDesktop && <button className="btn" onClick={async () => { const f = await api.pickFile('image'); if (f) set({ backgroundImage: await api.importArt(f) }); }}>Choose file</button>}
                </div>
              )}
              {(tv || s.background === 'live') && (
                <div className="wallpapers">
                  {WALLPAPERS.map((w) => (
                    <button key={w.id} className={`wp-card ${s.wallpaper === w.id ? 'on' : ''}`} onClick={() => set({ wallpaper: w.id })} title={w.hint}>
                      <Wallpaper kind={w.id} still />
                      <span>{w.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {!tv && s.background === 'video' && (
                <div className="inline">
                  <input value={s.videoFile} onChange={(e) => set({ videoFile: e.target.value })} placeholder="Video file or URL (MP4 or WebM, loops silently)" />
                  {isDesktop && <button className="btn" onClick={async () => { const f = await api.pickFile('video'); if (f) set({ videoFile: await api.importArt(f) }); }}>Choose video</button>}
                </div>
              )}
              {!tv && (s.background === 'hero' || s.background === 'image') && (
                <>
                  <Slider label="Blur" value={s.backgroundBlur} min={0} max={80} onChange={(v) => set({ backgroundBlur: v })} format={(v) => `${v}px`} />
                  <Slider label="Dim" value={s.backgroundDim} min={0.2} max={0.95} step={0.05} onChange={(v) => set({ backgroundDim: v })} format={(v) => `${Math.round(v * 100)}%`} />
                </>
              )}
              <Toggle label="Reduce motion" hint="Turns off hover zoom and transitions" checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
              <AnimSettings />
            </>
          )}

          {tab === 'library' && (
            <>
              <Toggle label="Scan launchers when Lumen starts" hint="Picks up games you installed or removed outside Lumen, without pressing Scan. It runs in the background, so the library is on screen straight away." checked={s.scanOnStart !== false} onChange={(v) => set({ scanOnStart: v })} />
              {!tv && (
                <label className="row"><span className="lbl">Layout</span>
                  <Segmented value={s.layout === 'list' ? 'list' : 'grid'} onChange={(v) => set({ layout: v })} options={[{ value: 'grid', label: 'Covers' }, { value: 'list', label: 'List' }]} />
                </label>
              )}
              <label className="row"><span className="lbl">Tile shape</span>
                <Segmented value={s.cardShape ?? 'portrait'} onChange={(v) => set({ cardShape: v })} options={[{ value: 'portrait', label: 'Tall cover' }, { value: 'landscape', label: 'Wide banner' }, { value: 'square', label: 'Square' }]} />
              </label>
              <p className="hint">Used in the desktop view and in Big Screen. Wide banner uses each game's landscape artwork.</p>
              <CardStyles />
              {!tv && (
                <>
                  <label className="row"><span className="lbl">Home rows</span>
                    <Segmented value={s.homeRows ?? 'shelves'} onChange={(v) => set({ homeRows: v })} options={[{ value: 'shelves', label: 'Scroll sideways' }, { value: 'wrap', label: 'Wrap onto lines' }]} />
                  </label>
                  <Slider label="Cover size" value={s.cardSize} min={120} max={300} onChange={(v) => set({ cardSize: v })} format={(v) => `${v}px`} />
                </>
              )}
              {tv && <p className="hint">Tile size in Big Screen is on the Big Screen page, under Card size.</p>}
              <label className="row"><span className="lbl">Sort games by</span>
                <select className="select" value={s.sort} onChange={(e) => set({ sort: e.target.value as Settings['sort'] })}>
                  <option value="playtime">Most played</option><option value="recent">Recently played</option><option value="title">A to Z</option><option value="added">Recently added</option><option value="source">Launcher</option>
                </select>
              </label>
              {!tv && <Toggle label="Show titles under covers" checked={s.showTitles} onChange={(v) => set({ showTitles: v })} />}
              <Toggle label="Show launcher badges" checked={s.showSourceBadges} onChange={(v) => set({ showSourceBadges: v })} />
              <h4>Collections</h4>
              <p className="hint">{tv ? 'Collections are made in the desktop view and show up here as rows you can turn on.' : 'Create collections from the sidebar with +. Right-click a game to put it in one.'}</p>
              <div className="chips">{library.categories.map((c) => <span key={c} className="chip on">{c}</span>)}</div>
            </>
          )}

          {tab === 'sources' && (
            <>
              <p className="hint">Lumen reads what each launcher has installed and starts games through that launcher, so your saves, achievements and cloud sync keep working. <b>Sign in</b> to a launcher to also load every game you own there, installed or not.</p>
              <div className="sources">
                {SOURCE_ORDER.filter((x) => x !== 'manual').map((id) => {
                  const r = library.reports.find((x) => x.source === id);
                  return (
                    <div key={id} className="source-row">
                      <SourceBadge source={id} />
                      <span className="src-name">{SOURCES[id].name}
                        <span className="hint">{s.enabledSources[id] === false ? 'Off' : r ? (r.error ? `Error: ${r.error}` : `${r.found} installed${r.owned !== undefined ? `, ${r.owned} owned` : ''}${r.ownedError ? ` (owned list: ${r.ownedError})` : ''}`) : 'Not scanned yet'}</span>
                      </span>
                      {(id === 'steam' || id === 'epic' || id === 'quiver') && (
                        <input className="path-input" placeholder={id === 'steam' ? 'Custom Steam folder (optional)' : id === 'epic' ? 'Custom Epic manifests folder (optional)' : 'Custom Quiver data folder (optional)'} value={s.customPaths[id] ?? ''} onChange={(e) => set({ customPaths: { ...s.customPaths, [id]: e.target.value } })} />
                      )}
                      <AccountButton id={id as AccountId} acc={acc} />
                      <button type="button" role="switch" aria-checked={s.enabledSources[id] !== false} className={`switch ${s.enabledSources[id] !== false ? 'on' : ''}`}
                        onClick={() => set({ enabledSources: { ...s.enabledSources, [id]: s.enabledSources[id] === false } as Record<SourceId, boolean> })}><i /></button>
                    </div>
                  );
                })}
              </div>
              <h4>Games you own but haven't installed</h4>
              <Toggle label="Show games that aren't installed" hint="They appear dimmed with an Install button that opens the right launcher" checked={s.showUninstalled} onChange={(v) => set({ showUninstalled: v })} />
              <div className="owned-box">
                <Toggle label="Steam: whole library" hint="Needs your Steam Web API key and SteamID. Get a key at steamcommunity.com/dev/apikey (any domain name works, e.g. localhost). Your SteamID64 is the number in your profile URL, or use your custom profile name. If nothing shows up, set Steam → Profile → Privacy → Game details to Public." checked={s.ownedSources.steam} onChange={(v) => set({ ownedSources: { ...s.ownedSources, steam: v } })} />
                <div className="two">
                  <input type="password" placeholder="Steam Web API key" value={s.steamApiKey} onChange={(e) => set({ steamApiKey: e.target.value.trim() })} />
                  <input placeholder="SteamID64 or profile name" value={s.steamId} onChange={(e) => set({ steamId: e.target.value.trim() })} />
                </div>
              </div>
              <Toggle label="Epic Games: whole library" hint="Read from the Epic launcher's own library cache on this PC. Open the Epic launcher's Library once so the cache is up to date." checked={s.ownedSources.epic} onChange={(v) => set({ ownedSources: { ...s.ownedSources, epic: v } })} />
              <Toggle label="GOG Galaxy: whole library, plus connected platforms" hint="Read from GOG Galaxy's database on this PC. If you connect Ubisoft, EA, Xbox or Battle.net inside GOG Galaxy (Settings → Integrations), their owned games show up here too." checked={s.ownedSources.galaxy} onChange={(v) => set({ ownedSources: { ...s.ownedSources, galaxy: v } })} />
              <Toggle label="Amazon Games: whole library" hint="Read from the Amazon Games app's database on this PC." checked={s.ownedSources.amazon} onChange={(v) => set({ ownedSources: { ...s.ownedSources, amazon: v } })} />
              <p className="hint">EA app, Ubisoft Connect, Xbox and Battle.net don't offer a way for other apps to read your owned games. Use the GOG Galaxy route above for those.</p>
              <button className="btn primary" onClick={scan} disabled={scanning}><Icon name="refresh" size={16} className={scanning ? 'spin' : ''} /> {scanning ? 'Scanning…' : 'Scan now'}</button>
              {library.lastScan && <p className="hint">Last scan {new Date(library.lastScan).toLocaleString()}</p>}
            </>
          )}

          {tab === 'accounts' && <AccountsTab acc={acc} />}
          {tab === 'sound' && <SoundTab />}
          {tab === 'controls' && <ControlsTab />}

          {tab === 'big' && (
            <>
              <CouchMode />
              <label className="row"><span className="lbl">Background</span>
                <Segmented value={s.bigScreenBackground} onChange={(v) => set({ bigScreenBackground: v })} options={[{ value: 'game', label: 'Selected game' }, { value: 'wallpaper', label: 'Live wallpaper' }]} />
              </label>
              {s.bigScreenBackground === 'wallpaper' && <p className="hint">Uses the wallpaper or video chosen in Appearance → Background.</p>}
              <h4>Screensaver</h4>
              <label className="row"><span className="lbl">Start after</span>
                <select className="select" value={String(s.screensaverMinutes ?? 3)} onChange={(e) => set({ screensaverMinutes: Number(e.target.value) })}>
                  <option value="0">Off</option><option value="1">1 minute</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="20">20 minutes</option>
                </select>
              </label>
              <label className="row"><span className="lbl">View</span>
                <select className="select" value={s.screensaverScene ?? 'shuffle'} onChange={(e) => set({ screensaverScene: e.target.value as Settings['screensaverScene'] })}>
                  <option value="shuffle">Shuffle (a new one every 90 seconds)</option>
                  {SAVERS.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.hint}</option>)}
                </select>
              </label>
              <label className="row"><span className="lbl">Where</span>
                <Segmented value={s.screensaverWhere ?? 'bigscreen'} onChange={(v) => set({ screensaverWhere: v })} options={[{ value: 'bigscreen', label: 'Big Screen only' }, { value: 'everywhere', label: 'Everywhere' }]} />
              </label>
              <Toggle label="Show the clock on the screensaver" hint="It drifts around the screen so no part of a TV panel stays lit" checked={s.screensaverClock !== false} onChange={(v) => set({ screensaverClock: v })} />
              <Toggle label="Show weather and game news on the screensaver" hint="The clock, the weather, headlines about your own games, the new releases and the world's most played, one at a time, each fading in and out in a new spot" checked={s.screensaverInfo !== false} onChange={(v) => set({ screensaverInfo: v })} />
              <Toggle label="Stay in Lumen while a game installs" hint="Once the launcher's download is really running, its window is minimized and Lumen comes back to the front, so you answer the install box and then you are back here. Windows only." checked={s.stayInLumen !== false} onChange={(v) => set({ stayInLumen: v })} />
              <Toggle label="Controller as a mouse for launcher windows" hint="When a launcher opens its own window over Big Screen (like Steam's Install box), the stick moves the mouse, A clicks, B is Escape and the D-pad works as the arrow keys. Windows only, and it stops as soon as the download starts." checked={s.padCursor !== false} onChange={(v) => set({ padCursor: v })} />
              <Toggle label="Controller icon on games" hint="A gamepad mark on games that support a controller, as listed on the Steam store. A half mark means partial support." checked={s.padBadges !== false} onChange={(v) => set({ padBadges: v })} />
              <Toggle label="Intro and outro animation" hint="The Lumen logo and chime when Big Screen starts and exits" checked={s.bigScreenIntro !== false} onChange={(v) => set({ bigScreenIntro: v })} />
              <Toggle label="Start in Big Screen" hint="Good for a TV or handheld PC" checked={s.startInBigScreen} onChange={(v) => set({ startInBigScreen: v })} />
              <label className="row"><span className="lbl">Scrolling</span>
                <Segmented value={s.bigScreenLayout} onChange={(v) => set({ bigScreenLayout: v })} options={[{ value: 'rows', label: 'Horizontal rows' }, { value: 'grid', label: 'Vertical grid' }]} />
              </label>
              <label className="row"><span className="lbl">Row movement</span>
                <Segmented value={s.bigScreenFollow ?? 'follow'} onChange={(v) => set({ bigScreenFollow: v })} options={[{ value: 'follow', label: 'Follow' }, { value: 'center', label: 'Centered' }, { value: 'page', label: 'Page by page' }]} />
              </label>
              <p className="hint">Follow keeps the selected game near the left. Centered keeps it in the middle. Page by page only moves the row when you reach its edge.</p>
              <label className="row"><span className="lbl">Button hints</span>
                <Segmented value={s.bigScreenHints ?? 'auto'} onChange={(v) => set({ bigScreenHints: v })} options={[{ value: 'auto', label: 'Fade when idle' }, { value: 'always', label: 'Always on' }, { value: 'off', label: 'Off' }]} />
              </label>
              <p className="hint">The row along the bottom that says what A, X, Y, B and View do. Fading hides it a few seconds after your last press and brings it back the moment you touch a button.</p>
              <label className="row"><span className="lbl">Card size</span>
                <Segmented value={s.bigScreenCardSize ?? 'large'} onChange={(v) => set({ bigScreenCardSize: v })} options={[{ value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }, { value: 'huge', label: 'Huge' }]} />
              </label>
              <h4>Rows on the home screen</h4>
              <p className="hint">Turn rows on or off and use the arrows to reorder them.</p>
              <div className="rows-edit">
                {[...s.bigScreenRows.filter((r) => BIG_ROWS.some((b) => b.id === r)), ...BIG_ROWS.map((b) => b.id).filter((r) => !s.bigScreenRows.includes(r))].map((id) => {
                  const on = s.bigScreenRows.includes(id);
                  const idx = s.bigScreenRows.indexOf(id);
                  const move = (d: number) => {
                    const r = [...s.bigScreenRows];
                    const j = idx + d;
                    if (j < 0 || j >= r.length) return;
                    [r[idx], r[j]] = [r[j], r[idx]];
                    set({ bigScreenRows: r });
                  };
                  return (
                    <div key={id} className={`row-item ${on ? '' : 'off'}`}>
                      <span>{BIG_ROWS.find((b) => b.id === id)!.label}</span>
                      <div className="spacer" />
                      {on && <><button className="icon-btn ghost tiny" onClick={() => move(-1)} aria-label="Move up">↑</button><button className="icon-btn ghost tiny" onClick={() => move(1)} aria-label="Move down">↓</button></>}
                      <button type="button" role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => set({ bigScreenRows: on ? s.bigScreenRows.filter((x) => x !== id) : [...s.bigScreenRows, id] })}><i /></button>
                    </div>
                  );
                })}
              </div>
              <h4>Controls</h4>
              <div className="controls-ref">
                <span><kbd>A</kbd> Open / Play</span><span><kbd>B</kbd> Back</span><span><kbd>X</kbd> Play now</span><span><kbd>Y</kbd> Favorite</span>
                <span><kbd>LB</kbd><kbd>RB</kbd> Switch tab</span><span><kbd>Start</kbd> Menu</span><span><kbd>B</kbd> Back, exits from Home</span><span><kbd>View</kbd> Power menu</span>
              </div>
              <p className="hint">On a keyboard: arrows, Enter, Esc (back, and exit from Home), P (play), F (favorite), Q/E (tabs), M (menu), F11 (full screen on or off). There's also an Exit button in the top right corner.</p>
            </>
          )}

          {tab === 'art' && (
            <>
              <p className="hint">Lumen finds artwork for free after every scan using the scrapers below. Nothing to set up.</p>
              <FixArt />
              <h4>Artwork scrapers</h4>
              <p className="hint">Lumen tries these from top to bottom and stops at the first cover it finds. All are free and need no account.</p>
              {ART_SOURCES.map((a) => (
                <Toggle key={a.id} label={a.label} hint={a.hint} checked={s.artSources?.[a.id] !== false} onChange={(v) => set({ artSources: { ...(s.artSources ?? {}), [a.id]: v } })} />
              ))}
              <h4>SteamGridDB (optional)</h4>
              <p className="hint">For games no store has art for, add a free SteamGridDB key: create an account on steamgriddb.com, open Preferences → API, and paste the key here.</p>
              <label className="field"><span>SteamGridDB API key</span><input type="password" value={s.steamGridDbKey} onChange={(e) => set({ steamGridDbKey: e.target.value })} placeholder="Paste your key" /></label>
              <Toggle label="Fetch missing artwork after each scan" checked={s.autoFetchArt} onChange={(v) => set({ autoFetchArt: v })} />
              <p className="hint">You can always set your own cover, background and logo for any game: right-click it and choose Edit and artwork.</p>
            </>
          )}

          {tab === 'menus' && <MenusTab />}

          {tab === 'general' && (
            <>
              <h4>{tx('Language')}</h4>
              <label className="row"><span className="lbl">{tx('Language')}</span>
                <select className="select" value={s.language ?? 'auto'} onChange={(e) => set({ language: e.target.value })}>
                  <option value="auto">{tx('Your Windows language')}</option>
                  {LANGS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.id !== 'en' && coverage(l.id) < 0.98 ? ` (${Math.round(coverage(l.id) * 100)}%)` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">Lumen's own menus, buttons and the vibes card follow this. Game names come from the launchers and stay as they are, and the longer help texts in Settings are English for now. A language that is not finished falls back to English for the rest, and the percentage next to its name says how much is done.</p>
              <Toggle label="Ask before shutting down or restarting" checked={s.confirmPower} onChange={(v) => set({ confirmPower: v })} />
              <Toggle label="Start Lumen when Windows starts" checked={s.launchOnStartup} onChange={(v) => set({ launchOnStartup: v })} />
              <Toggle label="Minimize Lumen when a game starts" checked={s.minimizeOnLaunch} onChange={(v) => set({ minimizeOnLaunch: v })} />
              <h4>{tx('Temperatures')}</h4>
              <Toggle label="Show temperatures" hint="CPU, graphics card, motherboard and drives, in the desktop sidebar, next to the Big Screen clock and in the Big Screen menu. Read every fifteen seconds, and only while Lumen is on screen." checked={s.tempsOn !== false} onChange={(v) => set({ tempsOn: v })} />
              <Temps always />
              <TempCheck />
              <p className="hint">Lumen reads what Windows itself can answer, and installs nothing to do it: drive temperatures through the storage counters, the graphics card through the NVIDIA driver, and on some boards a rough CPU thermal zone. A per-core CPU reading and a motherboard reading need a kernel driver that Windows does not offer, so most desktops show fewer lines than a dedicated monitoring tool would. If you already run one that publishes over WMI, its readings are picked up here too.</p>
              <h4>{tx('Drive space')}</h4>
              <Drives counts={driveCounts(library.games)} />
              <p className="hint">How much room is left on every drive Windows can see, read again every half minute. The count is how many of your installed games sit on that drive. The bar turns amber under a fifth left and red under a tenth, so you can see before a download that a drive is nearly full.</p>
              <h4>About</h4>
              <p className="hint">Lumen 0.1.0. Your library, settings and custom art are stored in %APPDATA%\Lumen.</p>
            </>
          )}
        </div>
      </div>
      </TvMode.Provider>
    </Modal>
  );
}

const STYLES = [
  { id: 'lumen', name: 'Lumen', hint: 'Soft glassy bells' },
  { id: 'crisp', name: 'Crisp', hint: 'Short techy clicks, in the spirit of a green-themed console' },
  { id: 'bubbly', name: 'Bubbly', hint: 'Playful pops and slides, in the spirit of a red-themed handheld' },
  { id: 'airy', name: 'Airy', hint: 'Spacious tones with long echoes, in the spirit of a blue-themed console' }
] as const;

const MUSIC_STYLES = [
  { id: 'lumen', name: 'Drift', hint: 'Warm slow chords with a few soft bells' },
  { id: 'crisp', name: 'Late night', hint: 'Lo-fi electric piano, slow and mellow' },
  { id: 'bubbly', name: 'Plaza', hint: 'Light, friendly marimba' },
  { id: 'airy', name: 'Deep space', hint: 'Two slow chords and a low drone, almost no melody' },
  { id: 'nebula', name: 'Nebula', hint: 'Two clouds of sound drifting past each other' },
  { id: 'orbit', name: 'Orbit', hint: 'A slow music-box line turning over a drone' },
  { id: 'pulsar', name: 'Pulsar', hint: 'One patient blip and its echo, over a deep hum' },
  { id: 'tides', name: 'Tides', hint: 'Long swells that rise and fall' },
  { id: 'driftwood', name: 'Driftwood', hint: 'A few wooden notes falling through a wide room' },
  { id: 'shuffle', name: 'Shuffle', hint: 'A different calm piece every few minutes' }
] as const;

function SoundTab() {
  const { settings: s, saveSettings: set } = useLumen();
  return (
    <>
      <p className="hint">All sounds and music are original and generated live by Lumen. Each style borrows the general feel of a console family without using any of their actual sounds. You can also play your own music file.</p>
      <h4>Interface sounds</h4>
      <div className="style-cards">
        <button className={`style-card ${s.soundPack === 'off' ? 'on' : ''}`} onClick={() => set({ soundPack: 'off' })}><b>Off</b><span>No sounds</span></button>
        {STYLES.map((st) => (
          <button key={st.id} className={`style-card ${s.soundPack === st.id ? 'on' : ''}`} onClick={() => { set({ soundPack: st.id }); playSound('select', st.id); setTimeout(() => playSound('launch', st.id), 300); }}>
            <b>{st.name}</b><span>{st.hint}</span>
          </button>
        ))}
      </div>
      <Slider label="Sound volume" value={s.soundVolume} min={0} max={1} step={0.05} onChange={(v) => set({ soundVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <h4>Background music</h4>
      <div className="style-cards">
        <button className={`style-card ${s.music === 'off' ? 'on' : ''}`} onClick={() => set({ music: 'off' })}><b>Off</b><span>Silence</span></button>
        {MUSIC_STYLES.map((st) => (
          <button key={st.id} className={`style-card ${s.music === st.id ? 'on' : ''}`} onClick={() => set({ music: st.id })}><b>{st.name}</b><span>{st.hint}</span></button>
        ))}
        <button className={`style-card ${s.music === 'custom' ? 'on' : ''}`} onClick={() => set({ music: 'custom' })} disabled={!s.musicFile}><b>My music</b><span>{s.musicFile ? 'Your file, looped' : 'Choose a file below first'}</span></button>
      </div>
      <div className="inline">
        <input value={s.musicFile} onChange={(e) => set({ musicFile: e.target.value })} placeholder="Music file or URL (MP3, OGG, FLAC, WAV, M4A)" />
        {isDesktop && <button className="btn" onClick={async () => { const f = await api.pickFile('audio'); if (f) set({ musicFile: await api.importArt(f), music: 'custom' }); }}>Choose file</button>}
      </div>
      <Slider label="Music volume" value={s.musicVolume} min={0} max={1} step={0.05} onChange={(v) => set({ musicVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <label className="row"><span className="lbl">Play music</span>
        <Segmented value={s.musicWhere} onChange={(v) => set({ musicWhere: v })} options={[{ value: 'bigscreen', label: 'In Big Screen' }, { value: 'everywhere', label: 'Everywhere' }]} />
      </label>
      <p className="hint">Music stops while a game is running and Lumen is minimized, and comes back when you return.</p>
    </>
  );
}

function ControlsTab() {
  const { settings: s, saveSettings: set, notify } = useLumen();
  const tv = useTv();
  const [capture, setCapture] = useState<{ kind: 'key' | 'pad' | 'app'; id: string } | null>(null);

  useEffect(() => {
    if (!capture || capture.kind === 'pad') return;
    (window as any).__lumenCapturing = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (capture.kind === 'key') {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        set({ keyBindings: { ...s.keyBindings, [capture.id]: [e.key] } });
        setCapture(null);
      } else {
        if (e.key === 'Escape') return setCapture(null);
        if (e.key === 'Backspace' || e.key === 'Delete') {
          set({ shortcuts: { ...s.shortcuts, [capture.id]: '' } });
          return setCapture(null);
        }
        const combo = comboFromEvent(e);
        if (!combo || ['Ctrl', 'Shift', 'Alt'].includes(combo.split('+').pop()!)) return; // wait for a real key
        set({ shortcuts: { ...s.shortcuts, [capture.id]: combo } });
        setCapture(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      (window as any).__lumenCapturing = false;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capture, s.keyBindings, s.shortcuts]);

  useEffect(() => {
    if (capture?.kind !== 'pad') return;
    let live = true;
    capturePadButton().then((i) => {
      if (!live) return;
      if (i < 0) notify('No controller button pressed');
      else set({ padBindings: { ...s.padBindings, [capture.id]: [i] } });
      setCapture(null);
    });
    return () => { live = false; };
  }, [capture]);

  const isCap = (kind: string, id: string) => capture?.kind === kind && capture.id === id;
  const saveGlobal = async (v: string) => {
    const ok = await api.setGlobalShortcut(v);
    if (!ok && v) return notify("Windows wouldn't accept that shortcut. Another app may be using it.");
    set({ globalBigScreenKey: v });
  };

  return (
    <>
      {!tv && <>
      <h4>App shortcuts</h4>
      <p className="hint">Click a shortcut, then press the new key combination. Backspace clears it, Esc cancels.</p>
      <div className="binds">
        {(Object.keys(APP_SHORTCUTS) as AppShortcutId[]).map((id) => (
          <div key={id} className="bind-row">
            <span>{APP_SHORTCUTS[id].label}</span>
            <button className={`bind ${isCap('app', id) ? 'capturing' : ''}`} onClick={() => setCapture({ kind: 'app', id })}>
              {isCap('app', id) ? 'Press keys…' : s.shortcuts[id] || 'Not set'}
            </button>
          </div>
        ))}
        <div className="bind-row">
          <span>Open Big Screen from anywhere in Windows<small className="hint">Works even when Lumen is in the background</small></span>
          <input className="bind-input" placeholder="e.g. Ctrl+Alt+B" defaultValue={s.globalBigScreenKey} onBlur={(e) => saveGlobal(e.target.value.trim())} />
        </div>
      </div>
      </>}
      <h4>Navigation (Big Screen and menus)</h4>
      <p className="hint">Click a key or button, then press the new one.</p>
      <div className="binds">
        <div className="bind-row head"><span>Action</span><span>Keyboard</span><span>Controller</span></div>
        {PAD_ACTIONS.map((id: PadActionId) => (
          <div key={id} className="bind-row three">
            <span>{PAD_ACTION_LABELS[id]}</span>
            <button className={`bind ${isCap('key', id) ? 'capturing' : ''}`} onClick={() => setCapture({ kind: 'key', id })}>
              {isCap('key', id) ? 'Press a key…' : (s.keyBindings[id] ?? []).map(keyLabel).join(' / ') || 'Not set'}
            </button>
            <button className={`bind ${isCap('pad', id) ? 'capturing' : ''}`} onClick={() => setCapture({ kind: 'pad', id })}>
              {isCap('pad', id) ? 'Press a button…' : (s.padBindings[id] ?? []).map((i) => PAD_BUTTON_NAMES[i] ?? `Button ${i}`).join(' / ') || 'Not set'}
            </button>
          </div>
        ))}
      </div>
      <p className="hint">The left stick always moves too. Button names follow the Xbox layout. On a PlayStation pad, A is Cross, B is Circle, X is Square and Y is Triangle.</p>
      <div className="row-btns">
        <button className="btn" onClick={() => { set({ keyBindings: { ...DEFAULT_KEYS }, padBindings: { ...DEFAULT_PAD }, shortcuts: { ...DEFAULT_SHORTCUTS } }); notify('Controls reset'); }}>Reset all to defaults</button>
      </div>
      <VoiceSettings />
    </>
  );
}

/** Voice control: the switch, how it is doing, and everything you can say. */
function VoiceSettings() {
  const { settings: s, saveSettings: set } = useLumen();
  const [state, setState] = useState<VoiceState>({ supported: api.platform === 'win32', listening: false, error: null });
  useEffect(() => { api.voiceState().then(setState); return api.onVoiceState(setState); }, []);

  return (
    <>
      <h4>Voice</h4>
      <p className="hint">
        Say <b>“OK Lumen”</b> and then a command. Lumen uses the speech recogniser that is already part of
        Windows, so nothing is installed and nothing leaves your PC: no recording is kept, and the microphone
        is only open while this is switched on. It listens for the short list below and for nothing else, which
        is also why it hears them accurately without any training.
      </p>
      <Toggle label="Listen for “OK Lumen”" hint="Windows only. The microphone is used only while this is on." checked={!!s.voice} onChange={(v) => set({ voice: v })} />
      <Toggle label="Start games by name" hint="“OK Lumen, play Hollow Orbit”. Your game names are added to what it listens for." checked={s.voiceLaunch !== false} onChange={(v) => set({ voiceLaunch: v })} />
      <Toggle label="Show what was heard" hint="A small pill in the corner while Lumen is listening." checked={s.voiceFeedback !== false} onChange={(v) => set({ voiceFeedback: v })} />
      {!state.supported
        ? <div className="voice-state">Voice control needs Windows.</div>
        : state.error
          ? <div className="voice-state">{state.error}</div>
          : <div className={`voice-state ${state.listening ? 'on' : ''}`}>{state.listening ? 'Listening for “OK Lumen”' : s.voice ? 'Starting…' : 'Not listening'}</div>}
      <ul className="voice-list">
        {VOICE_COMMANDS.map((c) => (
          <li key={c.id}><b>“OK Lumen, {c.phrases[0]}”</b><span>{c.what}</span></li>
        ))}
        {s.voiceLaunch !== false && <li><b>“OK Lumen, play <i>a game</i>”</b><span>Start that game</span></li>}
      </ul>
      <p className="hint">
        Nothing happens without the wake words, so the room can talk freely. The power menu opens on a word but
        nothing is ever shut down by one: that still needs a button. If it is not hearing you, check that Windows
        has a speech recogniser set up under Time &amp; language → Speech, and that the microphone is allowed under
        Privacy → Microphone.
      </p>
    </>
  );
}

const ACCOUNT_ORDER: AccountId[] = ['steam', 'epic', 'gog', 'xbox', 'ea', 'ubisoft', 'battlenet', 'amazon'];
const ACCOUNT_NOTE: Partial<Record<AccountId, string>> = {
  xbox: 'Lists PC games you have played with this Xbox account (including Game Pass).',
  battlenet: 'Experimental',
  amazon: 'Experimental',
  ea: 'Experimental',
  ubisoft: 'Experimental'
};

/** Sign-in state shared by the Launchers and Accounts tabs. */
function useAccounts() {
  const { notify, scan, scanning, library } = useLumen();
  const [list, setList] = useState<AccountInfo[] | null>(null);
  const [busy, setBusy] = useState<AccountId | null>(null);
  useEffect(() => { api.accounts().then(setList); }, [scanning, library.lastScan]);
  const signIn = async (id: AccountId) => {
    setBusy(id);
    const r = await api.signIn(id);
    setBusy(null);
    setList(r.accounts);
    notify(r.ok ? `Signed in to ${SOURCES[id].name}. Loading your games…` : r.error === 'Sign-in window closed' ? 'Sign-in cancelled' : `Sign-in failed: ${r.error}`);
  };
  const signOut = async (id: AccountId) => setList(await api.signOut(id));
  return { list, busy, signIn, signOut, scan, scanning };
}
type Accounts = ReturnType<typeof useAccounts>;

function AccountButton({ id, acc }: { id: AccountId; acc: Accounts }) {
  const a = acc.list?.find((x) => x.id === id);
  if (!a) return null;
  if (!a.signedIn) return <button className="btn primary small" disabled={!!acc.busy} onClick={() => acc.signIn(id)}>{acc.busy === id ? 'Waiting for sign-in…' : 'Sign in'}</button>;
  return (
    <span className="acct-state">
      {a.error ? <button className="btn small primary" title={a.error} onClick={() => acc.signIn(id)}>Sign in again</button> : <span className="ok" title={a.games !== undefined ? `${a.games} games` : ''}>✓ {a.name || 'Signed in'}</span>}
      <button className="btn small" onClick={() => acc.signOut(id)}>Sign out</button>
    </span>
  );
}

function AccountsTab({ acc }: { acc: Accounts }) {
  return (
    <>
      <p className="hint">Sign in to load every game you own, installed or not. You sign in on the store's own login page in a separate window, so Lumen never sees your password. Lumen keeps only a sign-in token, encrypted for your Windows account.</p>
      <div className="accounts">
        {ACCOUNT_ORDER.map((id) => acc.list?.find((x) => x.id === id)).filter((a): a is AccountInfo => !!a).map((a) => (
          <div key={a.id} className="account">
            <SourceBadge source={a.id} />
            <span className="src-name">{SOURCES[a.id].name}
              <span className="hint">{a.signedIn ? <>{a.error ? <span className="error">{a.error}</span> : <span className="ok">Signed in{a.name ? ` as ${a.name}` : ''}</span>}{a.games !== undefined && ` · ${a.games} games`}</> : ACCOUNT_NOTE[a.id] ?? 'Not signed in'}</span>
            </span>
            <AccountButton id={a.id} acc={acc} />
          </div>
        ))}
      </div>
      <button className="btn" onClick={acc.scan} disabled={acc.scanning}><Icon name="refresh" size={16} className={acc.scanning ? 'spin' : ''} /> {acc.scanning ? 'Loading…' : 'Reload my games'}</button>
      <h4>Good to know</h4>
      <p className="hint"><b>Steam, Epic Games and GOG</b> use the same sign-in other launchers like Heroic and Playnite use.</p>
      <p className="hint"><b>Xbox, EA, Ubisoft, Battle.net and Amazon</b> have no official way for other apps to read your games, so Lumen uses each one's own website sign-in. These are experimental: if one fails you'll see the reason here, and installed games still show up either way. Connecting those launchers inside GOG Galaxy also works as a backup.</p>
      <p className="hint">A Steam Web API key (Settings → Launchers) still works as an alternative to signing in to Steam.</p>
    </>
  );
}

const ART_SOURCES: { id: ArtSourceId; label: string; hint: string }[] = [
  { id: 'steamLocal', label: 'Steam images on this PC', hint: 'The covers the Steam app has already downloaded. Works offline.' },
  { id: 'steamStore', label: 'Steam store', hint: 'Official covers, backgrounds and logos. Also used for games from other launchers that are on Steam too.' },
  { id: 'epic', label: 'Epic Games store', hint: 'Official covers by exact game name.' },
  { id: 'gog', label: 'GOG store', hint: 'Official covers by exact game name.' },
  { id: 'wikipedia', label: 'Wikipedia', hint: "Box art from the game's Wikipedia article. Good for older and console-era games." },
  { id: 'web', label: 'Web image search', hint: 'Last resort: searches the web for "<game> game cover" and takes a portrait picture whose title names the game. Can occasionally pick a wrong picture; you can change any cover by hand.' }
];

function FixArt() {
  const { library } = useLumen();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ missingBefore: number; missingAfter: number } | null>(null);
  const missing = library.games.filter((g) => !(g.overrides.art?.cover || g.art.cover)).length;
  const run = async () => {
    setBusy(true);
    try { setRes(await api.fixArt()); } finally { setBusy(false); }
  };
  return (
    <div className="fixart">
      <button className="btn primary" onClick={run} disabled={busy}><Icon name="image" size={16} /> {busy ? 'Finding artwork…' : 'Find missing artwork now'}</button>
      <span className="muted">
        {res ? `Fixed ${res.missingBefore - res.missingAfter} of ${res.missingBefore}. ${res.missingAfter ? `${res.missingAfter} still have no cover: right-click them → Edit and artwork to pick one.` : 'Every game has a cover now.'}`
          : `${missing} of ${library.games.length} games have no cover yet.`}
      </span>
    </div>
  );
}

/** One-click setup for a TV / couch PC, plus the bridge to Windows Xbox mode (FSE). */
function CouchMode() {
  const { settings: s, saveSettings: set, notify } = useLumen();
  const [st, setSt] = useState<CouchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const refresh = () => api.couchStatus().then(setSt).catch(() => undefined);
  useEffect(() => { refresh(); }, []);
  const on = !!s.couchMode;
  const toggle = async () => {
    setBusy(true);
    try {
      const next = await api.couchSetup(!on);
      setSt(next);
      set({ couchMode: !on, startInBigScreen: !on, launchOnStartup: !on });
      notify(!on ? 'Couch mode is on. Lumen will start in Big Screen with Windows.' : 'Couch mode is off');
    } finally { setBusy(false); }
  };
  const copy = (what: 'copyPath' | 'copyArg' | 'copyLink') => { api.couchOpen(what); setCopied(what); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="couch">
      <div className="couch-head">
        <div>
          <h4>Couch mode</h4>
          <p className="hint">One click sets this PC up for the sofa: Lumen starts with Windows, opens straight into full screen Big Screen, and gets a "Lumen Big Screen" desktop shortcut and a <code>lumen://bigscreen</code> link that controller tools can start.</p>
        </div>
        <button className={`btn ${on ? '' : 'primary'}`} disabled={busy} onClick={toggle}>{busy ? 'Working…' : on ? 'Turn off couch mode' : 'Set up couch mode'}</button>
      </div>
      {on && <p className="ok couch-on">✓ Couch mode is on</p>}
      <h4>Windows Xbox mode (full screen experience)</h4>
      <p className="hint">Windows only lets Store-style apps be the Xbox mode home app, so Lumen can't take that slot itself. A free bridge app can: Windows starts the bridge, the bridge starts Lumen in Big Screen, and the PC comes up on the TV in Big Screen with nothing on screen but Lumen.</p>
      <p className="hint">Use <b>AnyFSE</b>. It takes a custom program, so Lumen goes in as itself, and it is a small MIT-licensed app. OmniConsole, in the box at the end, does the same job and is still there if you already use it. Lumen never installs either of them for you: between them they want administrator rights, a certificate and Windows' developer mode, and that is not a games launcher's business. The steps below hand you the exact path and argument to paste.</p>
      <ol className="couch-steps">
        <li>
          <span>Turn on couch mode above.</span>
          <span className={on ? 'ok' : 'muted'}>{on ? '✓ Done' : 'Not yet'}</span>
        </li>
        <li>
          <span>Unlock the full Xbox mode with the free Xbox Full Screen Experience Tool: install it, press its "Enable Xbox Mode (FSE)" button and let the PC restart. Normal PCs need this to get "Choose home app". Handhelds that already have it can skip this.
            <em className="warn"> It changes Windows system settings, so make a restore point first. Its "Disable &amp; Restore" button undoes it.</em>
            {st && !st.fseCapable && st.windowsBuild > 0 && <em className="warn"> This PC is on Windows build {st.windowsBuild}.{st.windowsRevision}; the tool needs 26100.7019 or newer, so run Windows Update first.</em>}
          </span>
          {st?.fseTool
            ? <span className="couch-copy"><span className="ok">✓ Installed</span>{st.fseToolCanOpen && <button className="btn small" onClick={() => api.couchOpen('openFseTool')}>Open the tool</button>}</span>
            : <button className="btn small" onClick={() => api.couchOpen('fseTool')}>Get the tool</button>}
        </li>
        <li>
          <span>Install AnyFSE: download <code>AnyFSE.Installer.exe</code> from its releases page and run it. It asks for administrator rights and may draw a Defender warning, because it has to register itself with Windows as a home app.</span>
          {st?.anyFse
            ? <span className="couch-copy"><span className="ok">✓ Installed</span>{st.anyFseCanOpen && <button className="btn small" onClick={() => api.couchOpen('openAnyFse')}>Open its folder</button>}</span>
            : <button className="btn small" onClick={() => api.couchOpen('anyfse')}>Get AnyFSE</button>}
        </li>
        <li>
          <span>Find AnyFSE in the Start menu, right-click it and choose <b>Configure</b>. Pick the custom executable option and paste Lumen's path, with <code>--bigscreen</code> as the startup argument.</span>
          <span className="couch-copy">
            <button className="btn small" onClick={() => copy('copyPath')}>{copied === 'copyPath' ? 'Copied' : 'Copy path'}</button>
            <button className="btn small" onClick={() => copy('copyArg')}>{copied === 'copyArg' ? 'Copied' : 'Copy argument'}</button>
            <button className="btn small" onClick={() => copy('copyLink')}>{copied === 'copyLink' ? 'Copied' : 'Copy link'}</button>
          </span>
        </li>
        <li>
          <span>In Windows Settings → Gaming → Full screen experience, choose AnyFSE as the home app and turn on entering it at startup. That is the whole thing: the PC now starts on the TV in Lumen.</span>
          <button className="btn small" onClick={() => api.couchOpen('gaming')}>Open Gaming settings</button>
        </li>
        <li className="couch-alt">
          <span><b>Instead of AnyFSE, if you prefer:</b> OmniConsole does the same job. Install it, add Lumen as a custom platform with the same path and argument, and choose OmniConsole as the home app in step 5.</span>
          {st?.omniConsole ? <span className="ok">✓ Installed</span> : <button className="btn small" onClick={() => api.couchOpen('omniconsole')}>Get OmniConsole</button>}
        </li>
      </ol>
      {st && <p className="hint couch-vals"><code>{st.exe}</code> <code>{st.arg}</code> · <code>{st.link}</code></p>}
      <p className="hint">If "Choose home app" is missing after step 2, open the Microsoft Store, update Xbox and Xbox Game Bar (check for updates twice), then look again.</p>
      <button className="btn small" onClick={refresh}>Check again</button>
    </div>
  );
}

/** A list you can reorder with the arrows and switch items off in. */
function OrderList({ items, order, hidden, onChange, keepOne }: { items: { id: string; label: string; icon?: string }[]; order?: string[]; hidden: string[]; onChange(order: string[], hidden: string[]): void; keepOne?: boolean }) {
  const ids = ordered(items.map((i) => i.id), order);
  const shown = ids.filter((id) => !hidden.includes(id)).length;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next, hidden);
  };
  return (
    <div className="rows-edit">
      {ids.map((id, i) => {
        const it = items.find((x) => x.id === id)!;
        const on = !hidden.includes(id);
        const last = keepOne && on && shown === 1;
        return (
          <div key={id} className={`row-item ${on ? '' : 'off'}`}>
            {it.icon && <Icon name={it.icon} size={16} />}
            <span>{it.label}</span>
            <div className="spacer" />
            <button className="icon-btn ghost tiny" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="icon-btn ghost tiny" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" role="switch" aria-checked={on} disabled={last} title={last ? 'At least one has to stay' : ''} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(ids, on ? [...hidden, id] : hidden.filter((x) => x !== id))}><i /></button>
          </div>
        );
      })}
    </div>
  );
}

/** Asks for a fresh read and says exactly what came back, which is the first thing to know. */
function TempCheck() {
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  if (!api.temps) return null;
  const check = async () => {
    setBusy(true);
    try {
      const r = await api.temps!(true);
      const kinds = [...new Set(r.list.map((x) => x.kind))].join(', ');
      setSaid(r.list.length
        ? `${r.list.length} readings (${kinds}), from ${r.list[0].source === 'monitor' ? 'a hardware monitor you are running' : 'Windows itself'}.`
        : r.note || 'Nothing came back.');
    } catch (e) {
      setSaid(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row">
      <span className="lbl">Check the sensors{said && <small className="hint">{said}</small>}</span>
      <button className="btn" disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Check again'}</button>
    </div>
  );
}

function MenusTab() {
  const { settings: s, saveSettings: set } = useLumen();
  const w = useWeather(!!s.weatherOn, `${s.weatherCity}|${s.weatherUnit}`);
  const [city, setCity] = useState(s.weatherCity ?? '');
  const navHidden = s.navHidden ?? [];
  const saveCity = async () => { await set({ weatherCity: city.trim() }); refreshWeather(true); };
  const tv = useTv();
  return (
    <>
      {!tv && <>
      <h4>Desktop sidebar</h4>
      <p className="hint">Use the arrows to change the order and the switches to hide what you don't use.</p>
      <OrderList items={NAV_ITEMS} order={s.navOrder} hidden={navHidden} keepOne onChange={(o, h) => set({ navOrder: o, navHidden: [...h, ...navHidden.filter((x) => x.startsWith('sec:') && !h.includes(x))] })} />
      <div className="rows-edit" style={{ marginTop: 6 }}>
        {NAV_SECTIONS.map((sec) => {
          const on = !navHidden.includes(sec.id);
          return (
            <div key={sec.id} className={`row-item ${on ? '' : 'off'}`}>
              <span>{sec.label}</span><div className="spacer" />
              <button type="button" role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => set({ navHidden: on ? [...navHidden, sec.id] : navHidden.filter((x) => x !== sec.id) })}><i /></button>
            </div>
          );
        })}
      </div>
      {(s.navOrder?.length || navHidden.length > 0) && <button className="btn small" style={{ marginTop: 8 }} onClick={() => set({ navOrder: [], navHidden: [] })}>Reset sidebar</button>}
      </>}

      <h4>Big Screen tabs</h4>
      <OrderList items={BIG_TABS} order={s.bigTabs} hidden={s.bigTabsHidden ?? []} keepOne onChange={(o, h) => set({ bigTabs: o, bigTabsHidden: h })} />
      <p className="hint">The first tab is where B takes you back to.</p>

      <h4>Weather</h4>
      <Toggle label="Show local weather" hint="In the top bar of the desktop view and next to the clock in Big Screen" checked={!!s.weatherOn} onChange={(v) => set({ weatherOn: v })} />
      <label className="row"><span className="lbl">City</span>
        <div className="inline">
          <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCity()} placeholder="Leave empty to detect automatically" />
          <button className="btn" onClick={saveCity}>Save</button>
        </div>
      </label>
      <label className="row"><span className="lbl">Units</span>
        <Segmented value={s.weatherUnit ?? 'c'} onChange={(v) => { set({ weatherUnit: v }).then(() => refreshWeather(true)); }} options={[{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }]} />
      </label>
      {s.weatherOn && (w?.ok
        ? <p className="hint"><Icon name={weatherIcon(w)} size={14} /> {w.place}: {w.temp}°, {w.label}, feels like {w.feels}°</p>
        : w && <p className="hint warn">{w.error}</p>)}
      <Toggle label="Use the weather as live wallpaper" hint="Rain, snow, clear sky or night, matching what's outside. Sets the background to Live." checked={s.background === 'live' && s.wallpaper === 'weather'} onChange={(v) => set(v ? { background: 'live', wallpaper: 'weather', weatherOn: true } : { wallpaper: 'hills' })} />
      <VibesSettings />
      <p className="hint">Weather comes from Open-Meteo, a free service. With the city left empty, Lumen asks ipwho.is for a rough location based on your internet connection. Nothing else is sent.</p>
    </>
  );
}

const NEWS_LANGS = [
  { value: 'auto', label: 'Your Windows language' }, { value: 'any', label: 'Any language' },
  { value: 'en', label: 'English' }, { value: 'de', label: 'German' }, { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' }, { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' }, { value: 'pl', label: 'Polish' }, { value: 'tr', label: 'Turkish' },
  { value: 'sv', label: 'Swedish' }, { value: 'da', label: 'Danish' }, { value: 'no', label: 'Norwegian' },
  { value: 'fi', label: 'Finnish' }, { value: 'cs', label: 'Czech' }, { value: 'hu', label: 'Hungarian' },
  { value: 'ro', label: 'Romanian' }, { value: 'hr', label: 'Croatian' }, { value: 'sl', label: 'Slovenian' },
  { value: 'sq', label: 'Albanian' }, { value: 'ru', label: 'Russian' }, { value: 'uk', label: 'Ukrainian' },
  { value: 'bg', label: 'Bulgarian' }, { value: 'sr', label: 'Serbian' }, { value: 'mk', label: 'Macedonian' },
  { value: 'el', label: 'Greek' }, { value: 'zh', label: 'Chinese' }, { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' }, { value: 'ar', label: 'Arabic' }, { value: 'he', label: 'Hebrew' },
  { value: 'th', label: 'Thai' }
] as const;

const VIBES_STYLES = [
  { id: 'panel', name: 'Panel', hint: 'A flat panel with an accent edge' },
  { id: 'soft', name: 'Soft', hint: 'A gentle tint of your accent colour' },
  { id: 'outline', name: 'Outline', hint: 'Only a thin line, nothing behind it' },
  { id: 'photo', name: 'Photo', hint: "The first pick's artwork, dimmed" },
  { id: 'bold', name: 'Bold', hint: 'Filled with your accent colour' },
  { id: 'glass', name: 'Glass', hint: 'Frosted and see-through' },
  { id: 'hidden', name: 'Off', hint: 'No card on Home at all' }
] as const;

const LOGO_STYLES: { id: LogoStyle; name: string; hint: string }[] = [
  { id: 'power', name: 'Power', hint: 'A power button. The line draws, then thickens.' },
  { id: 'orbit', name: 'Orbit', hint: 'A tilted orbit with a moon, swinging into place.' },
  { id: 'pulse', name: 'Pulse', hint: 'One closed ring and the light inside it.' },
  { id: 'reactor', name: 'Reactor', hint: 'Three arcs that arrive one after the other.' },
  { id: 'spark', name: 'Spark', hint: "Lumen's first ring, its light brought to the middle." }
];

/**
 * Picking a mark from a still picture tells you nothing about the half of it that moves, so every
 * one here is the real mark, really animating. Clicking any of them replays all five, which is the
 * only way to compare them fairly.
 */
function LogoPicker() {
  const { settings: s, saveSettings: set } = useLumen();
  const now = s.logoStyle ?? 'power';
  // A counter rather than a flag: picking the same mark again has to replay it, and a flag that is
  // already true would not change and so would not remount anything.
  const [play, setPlay] = useState(0);
  return (
    <>
      <h4>Lumen mark</h4>
      <p className="hint">The logo in the sidebar, on the empty library screen and in the Big Screen intro. Pick one to watch it draw itself; picking it again plays it over. The light in the middle is green while Lumen is on, and turns red as it goes off.</p>
      <div className="logo-styles">
        {LOGO_STYLES.map((l) => (
          <button key={l.id} type="button" className={`logo-style ${now === l.id ? 'on' : ''}`}
                  onClick={() => { set({ logoStyle: l.id }); setPlay((n) => n + 1); }} title={l.hint}>
            <span className="logo-mini"><Logo key={`${l.id}-${play}`} size={54} style={l.id} animate /></span>
            <b>{l.name}</b>
            <small>{l.hint}</small>
          </button>
        ))}
      </div>
    </>
  );
}

const VIBES_MOODS = [
  { value: 'auto', label: 'Rotate daily' }, { value: 'weather', label: 'Weather' }, { value: 'positive', label: 'Positive vibes' },
  { value: 'fresh', label: 'Fresh start' }, { value: 'comeback', label: 'Comeback' }, { value: 'quick', label: 'Quick one' },
  { value: 'night', label: 'Late one' }, { value: 'morning', label: 'Morning vibes' }, { value: 'deep', label: 'Deep dive' },
  { value: 'news', label: 'Game news' }, { value: 'releases', label: 'Just released' }, { value: 'world', label: 'Most played in the world' }
] as const;

/** The look and the mood of the vibes card on Home, with a small live preview of each look. */
function VibesSettings() {
  const { settings: s, saveSettings: set, library } = useLumen();
  const now = s.vibesStyle ?? 'panel';
  const art = library.games.map((g) => heroOf(g) ?? artOf(g).cover).find(Boolean);
  return (
    <>
      <h4>Vibes card</h4>
      <p className="hint">The card at the top of Home, in the desktop view and in Big Screen.</p>
      <div className="vibe-styles">
        {VIBES_STYLES.map((v) => (
          <button key={v.id} type="button" className={`vibe-style ${now === v.id ? 'on' : ''}`} onClick={() => set({ vibesStyle: v.id })} title={v.hint}>
            <span className={`vibes-mini v-${v.id}`} style={art ? ({ ['--vibes-art' as string]: `url("${art}")` } as CSSProperties) : undefined}>
              {v.id === 'hidden' ? <i className="vibes-mini-off">Off</i> : <><i /><u /><u className="short" /></>}
            </span>
            <b>{v.name}</b>
            <small>{v.hint}</small>
          </button>
        ))}
      </div>
      <label className="row"><span className="lbl">Mood</span>
        <select className="select" value={s.vibesMood ?? 'auto'} onChange={(e) => set({ vibesMood: e.target.value as Settings['vibesMood'] })} disabled={now === 'hidden'}>
          {VIBES_MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      <label className="row"><span className="lbl">News language</span>
        <select className="select" value={s.newsLanguage ?? 'auto'} onChange={(e) => set({ newsLanguage: e.target.value })}>
          {NEWS_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      <p className="hint">A game's Steam news feed mixes every language the developer posts in. Lumen reads each announcement and keeps the ones you can read, so a Russian post does not show up when you read English. Pick "Any language" to see them all.</p>
      <p className="hint">Game news reads Google News' gaming topic, the same page as news.google.com's Gaming section. Just released and Most played in the world read Steam's own public pages. All three need the internet, and nothing about you is sent: the news request carries only a topic and a language. If Google News cannot be reached, the card falls back to the news of your own Steam games, and that request carries only the ids of games already in your library.</p>
      <p className="hint">Rotate daily gives you a different mood each day, and the card gets an "Another vibe" button to step through the rest by hand. Pick one instead and it stays. A mood with nothing to show falls back to the next one that fits.</p>
    </>
  );
}

const ICON_ANIMS = [{ value: 'lively', label: 'Lively' }, { value: 'pop', label: 'Pop' }, { value: 'draw', label: 'Draw' }, { value: 'spin', label: 'Spin' }, { value: 'off', label: 'Off' }] as const;
const CARD_ANIMS = [{ value: 'full', label: 'Everything' }, { value: 'pop', label: 'Pop' }, { value: 'shine', label: 'Shine' }, { value: 'glow', label: 'Glow' }, { value: 'float', label: 'Float' }, { value: 'tilt', label: 'Tilt' }, { value: 'off', label: 'Off' }] as const;
const ICON_HINT: Record<string, string> = { lively: 'Each icon moves in its own way', pop: 'Every icon gives a small pop', draw: 'Outlines redraw themselves, nothing else moves', spin: 'Every icon makes one full turn', off: 'Icons stay still' };
const CARD_HINT: Record<string, string> = { full: 'Pop, light sweep, drifting artwork and a breathing glow', pop: 'A quick pop forward, then still', shine: 'A light sweeps across once', glow: 'The glow breathes in and out', float: 'The tile gently bobs up and down', tilt: 'The tile slowly turns side to side in 3D', off: 'Just the highlight, no movement' };

const CARD_STYLES = [
  { id: 'classic', name: 'Classic', hint: 'Soft shadow, gentle lift' },
  { id: 'dvd', name: 'DVD case', hint: 'The cover in a keep case. The disc slides out and turns while selected.' },
  { id: 'flat', name: 'Flat', hint: 'A quiet outline, nothing moves' },
  { id: 'frame', name: 'Framed', hint: 'The artwork sits in a mat' },
  { id: 'glass', name: 'Glass', hint: 'A frosted pane with a lit edge' },
  { id: 'neon', name: 'Neon', hint: 'Ringed in your accent colour' },
  { id: 'rgb', name: 'RGB', hint: 'A turning rainbow ring on the game you are on' },
  { id: 'shelf', name: 'Shelf', hint: 'Standing on a surface, with a shadow under it' },
  { id: 'sticker', name: 'Sticker', hint: 'A cut edge and a hard shadow' }
] as const;

/** The look of a game tile, shown on real artwork from the library so the choice is honest. */
function CardStyles() {
  const { settings: s, saveSettings: set, library } = useLumen();
  const now = s.cardStyle ?? 'classic';
  const sample = library.games.find((g) => g.art.cover || g.overrides.art?.cover) ?? library.games[0];
  return (
    <>
      <h4>Tile style</h4>
      <div className="card-styles">
        {CARD_STYLES.map((c) => (
          <button key={c.id} type="button" className={`card-style ${now === c.id ? 'on' : ''}`} onClick={() => set({ cardStyle: c.id })} title={c.hint}>
            <div className="card-style-art">
              {sample ? <Cover g={sample} style={c.id} focused={now === c.id || c.id === 'rgb'} showBadge={false} showTitle={false} /> : <div className="card-style-blank" />}
            </div>
            <b>{c.name}</b>
            <small>{c.hint}</small>
          </button>
        ))}
      </div>
    </>
  );
}

/** Animation style choices with a live preview. */
function AnimSettings() {
  const { settings: s, saveSettings: set, library } = useLumen();
  const [tick, setTick] = useState(0);
  const sample = library.games.find((g) => g.art.cover) ?? library.games[0];
  const icon = s.iconAnim ?? 'lively', card = s.cardAnim ?? 'full';
  if (s.reduceMotion) return <p className="hint">Turn off Reduce motion to choose animation styles.</p>;
  return (
    <>
      <h4>Animations</h4>
      <label className="row"><span className="lbl">Menu icons</span>
        <Segmented value={icon} onChange={(v) => { set({ iconAnim: v }); setTick((t) => t + 1); }} options={[...ICON_ANIMS]} />
      </label>
      <p className="hint">{ICON_HINT[icon]}.</p>
      <label className="row"><span className="lbl">Selected game</span>
        <Segmented value={card} onChange={(v) => { set({ cardAnim: v }); setTick((t) => t + 1); }} options={[...CARD_ANIMS]} />
      </label>
      <p className="hint">{CARD_HINT[card]}.</p>
      <label className="row"><span className="lbl">Speed</span>
        <Segmented value={s.animSpeed ?? 'normal'} onChange={(v) => { set({ animSpeed: v }); setTick((t) => t + 1); }} options={[{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }]} />
      </label>
      <div className="anim-preview" key={tick}>
        {sample && <Cover g={sample} focused showBadge={false} />}
        <div>
          <p className="hint" style={{ marginTop: 0 }}>Preview. Move the mouse over the buttons, or press Replay.</p>
          <div className="anim-icons">
            {['home', 'settings', 'star', 'search', 'power', 'tv', 'moon', 'refresh'].map((n) => <button key={n} type="button"><Icon name={n} /></button>)}
            <button type="button" className="focused" onClick={() => setTick((t) => t + 1)}><Icon name="play" /> Replay</button>
          </div>
        </div>
      </div>
    </>
  );
}
