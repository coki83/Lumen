import { useEffect, useState } from 'react';
import { useAppActive } from './lib/focus';
import { useIdle } from './lib/idle';
import { Screensaver } from './components/Screensaver';
import { suppressInput } from './lib/gamepad';
import { comboFromEvent } from '../shared/bindings';
import { api } from './lib/api';
import { sendCommand } from './lib/commands';
import { setInputBindings } from './lib/gamepad';
import { configureSounds, playMusic, playSound, stopMusic } from './lib/sound';
import { useLumen } from './lib/store';
import { useVoice } from './lib/voice';
import { pickLang, setLang, t } from './lib/i18n';
import { FONTS, THEMES, hexToGlow, inkFor } from './lib/themes';
import { BigScreen } from './views/BigScreen';
import { Desktop } from './views/Desktop';

function useTheme() {
  const { settings: s } = useLumen();
  useEffect(() => {
    const t = THEMES.find((x) => x.id === s.theme) ?? THEMES[0];
    const root = document.documentElement;
    const vars: Record<string, string> = { ...t.vars };
    if (s.accent) {
      vars.accent = s.accent;
      vars.accentInk = inkFor(s.accent);
      vars.glow = hexToGlow(s.accent);
    }
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, v);
    root.style.setProperty('--font', FONTS[s.font === 'theme' ? t.font : s.font]);
    root.style.setProperty('--radius', `${s.cardRadius}px`);
    root.style.setProperty('--bg-blur', `${s.backgroundBlur}px`);
    root.style.setProperty('--bg-dim', String(s.backgroundDim));
    root.style.fontSize = `${15 * s.fontScale}px`;
    root.dataset.scheme = t.dark ? 'dark' : 'light';
    root.dataset.density = s.density;
    root.dataset.shape = s.cardShape ?? 'portrait';
    root.dataset.ianim = s.iconAnim ?? 'lively';
    root.dataset.canim = s.cardAnim ?? 'full';
    root.style.setProperty('--aspd', s.animSpeed === 'slow' ? '1.7' : s.animSpeed === 'fast' ? '0.6' : '1');
    root.dataset.motion = s.reduceMotion ? 'reduce' : 'full';
    root.dataset.ui = s.ui ?? 'full';
    root.dataset.bg = s.background;
  }, [s]);
}

export function App() {
  const { toast, settings: s, saveSettings, library, launch } = useLumen();
  useTheme();
  const [big, setBig] = useState(() => location.hash === '#bigscreen');
  // "On screen" means visible and in front: a game covering Lumen in Big Screen is not hidden,
  // but Lumen is no longer the window you are using, so its music and wallpaper go quiet.
  const hidden = !useAppActive();

  useEffect(() => {
    const onHash = () => setBig(location.hash === '#bigscreen');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => setInputBindings(s.keyBindings, s.padBindings), [s.keyBindings, s.padBindings]);
  useEffect(() => configureSounds(s.soundPack, s.soundVolume), [s.soundPack, s.soundVolume]);

  // Music plays only while Lumen is the window in front, so it stops the moment a game takes over.
  useEffect(() => {
    const want = s.music !== 'off' && !hidden && (s.musicWhere === 'everywhere' || big);
    if (want) playMusic(s.music, s.musicVolume, s.musicFile);
    else stopMusic(hidden);
  }, [s.music, s.musicVolume, s.musicFile, s.musicWhere, big, hidden]);

  useEffect(() => {
    if (toast) playSound(/couldn't|error|problem/i.test(toast) ? 'error' : /launching/i.test(toast) ? 'launch' : 'notify');
  }, [toast]);

  const enterBig = () => {
    location.hash = 'bigscreen';
    api.setFullscreen(true);
    playSound('open');
  };
  const exitBig = () => {
    location.hash = '';
    api.setFullscreen(false);
    playSound('back');
  };
  const toggleBig = () => (location.hash === '#bigscreen' ? exitBig() : enterBig());

  useEffect(() => api.onToggleBigScreen(toggleBig), []);

  // Voice control. Off until it is asked for, and it listens for the wake words only.
  const voice = useVoice(!!s.voice, s.voiceLaunch !== false, library.games, {
    big,
    enterBig,
    exitBig,
    setMusic: (on) => saveSettings({ music: on ? (s.music === 'off' ? 'lumen' : s.music) : 'off' }),
    launch: (g) => { void launch(g); },
    stopVoice: () => saveSettings({ voice: false })
  });
  // The pill shows what was heard, then clears itself.
  const [echoOn, setEchoOn] = useState(false);
  useEffect(() => {
    if (!voice.echo) return;
    setEchoOn(true);
    const t = setTimeout(() => setEchoOn(false), 2600);
    return () => clearTimeout(t);
  }, [voice.echo?.at]);

  // Shortcuts from Settings → Controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') && !e.ctrlKey) return;
      if ((window as any).__lumenCapturing) return;
      const combo = comboFromEvent(e);
      const hit = Object.entries(s.shortcuts).find(([, v]) => v && v.toLowerCase() === combo.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      const [id] = hit;
      if (id === 'bigScreen') toggleBig();
      else if (id === 'toggleMusic') saveSettings({ music: s.music === 'off' ? 'lumen' : 'off' });
      else sendCommand(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.shortcuts, s.music]);

  // After a few quiet minutes the screen turns into a window on space. Any input brings it back,
  // and that first press is swallowed so it doesn't also start a game.
  const saverOn = (s.screensaverMinutes ?? 3) > 0 && !hidden && (s.screensaverWhere === 'everywhere' || big);
  const idle = useIdle((s.screensaverMinutes ?? 3) * 60000, saverOn);
  const showSaver = saverOn && idle;
  useEffect(() => {
    if (!showSaver) return;
    return () => suppressInput(700);
  }, [showSaver]);

  // The language is read once per render pass, before anything draws, and the key below remounts
  // the views when it changes so every piece of text is read again.
  const code = pickLang(s.language);
  setLang(code);

  return (
    <>
      {big ? <BigScreen key={code} onExit={exitBig} /> : <Desktop key={code} onBigScreen={enterBig} />}
      {toast && <div className="toast">{toast}</div>}
      {s.voice && s.voiceFeedback !== false && (voice.state.listening || echoOn) && (
        <div className={`voice-pill ${echoOn ? 'said' : ''}`}>
          <i className="voice-dot" aria-hidden />
          {echoOn && voice.echo
            ? <span className="voice-said">{voice.echo.did ?? `"${voice.echo.said}" — not a command`}</span>
            : <span className="voice-said">{t('Listening')}</span>}
        </div>
      )}
      {showSaver && <Screensaver scene={s.screensaverScene ?? 'shuffle'} clock={s.screensaverClock !== false} info={s.screensaverInfo !== false} weatherOn={!!s.weatherOn} onWake={() => suppressInput(700)} />}
    </>
  );
}
