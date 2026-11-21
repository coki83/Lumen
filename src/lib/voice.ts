import { useEffect, useRef, useState } from 'react';
import { readVoice } from '../../shared/voice';
import type { Game, VoiceState } from '../../shared/types';
import { api } from './api';
import { sendCommand } from './commands';
import { titleOf } from './library';
import { playSound } from './sound';

/** What a heard phrase turned into, for the little pill in the corner. */
export interface VoiceEcho {
  said: string;
  /** What Lumen did about it, or null when it could not place the words. */
  did: string | null;
  at: number;
}

/** A key press, so a spoken "move down" travels the same road the pad and the arrow keys do. */
function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

interface Acts {
  big: boolean;
  enterBig: () => void;
  exitBig: () => void;
  setMusic: (on: boolean) => void;
  launch: (g: Game) => void;
  stopVoice: () => void;
}

/**
 * Listens for "OK Lumen" and does what comes after it.
 *
 * The words arrive from the main process, which drives the recogniser Windows already has. The
 * list of games is sent over whenever the library changes, so a game added today can be asked for
 * by name today.
 */
export function useVoice(on: boolean, allowLaunch: boolean, games: Game[], acts: Acts) {
  const [state, setState] = useState<VoiceState>({ supported: api.platform === 'win32', listening: false, error: null });
  const [echo, setEcho] = useState<VoiceEcho | null>(null);
  const live = useRef(acts);
  live.current = acts;
  const list = useRef(games);
  list.current = games;

  // Heard words. Mounted once, so a command never runs twice.
  useEffect(() => api.onVoice((said) => {
    const games = list.current;
    const { id, title } = readVoice(said, games.map(titleOf));
    const a = live.current;
    let did: string | null = null;
    switch (id) {
      case 'home': did = 'Home'; sendCommand('home'); break;
      case 'library': did = 'Library'; sendCommand('library'); break;
      case 'favorites': did = 'Favourites'; sendCommand('favorites'); break;
      case 'search': did = 'Search'; sendCommand('search'); break;
      case 'settings': did = 'Settings'; sendCommand('settings'); break;
      case 'rescan': did = 'Scanning'; sendCommand('rescan'); break;
      case 'bigOn': if (!a.big) { did = 'Big Screen'; a.enterBig(); } break;
      case 'bigOff': if (a.big) { did = 'Desktop'; a.exitBig(); } break;
      case 'select': did = 'Select'; press('Enter'); break;
      case 'back': did = 'Back'; press('Escape'); break;
      case 'up': did = 'Up'; press('ArrowUp'); break;
      case 'down': did = 'Down'; press('ArrowDown'); break;
      case 'left': did = 'Left'; press('ArrowLeft'); break;
      case 'right': did = 'Right'; press('ArrowRight'); break;
      case 'musicOn': did = 'Music on'; a.setMusic(true); break;
      case 'musicOff': did = 'Music off'; a.setMusic(false); break;
      // Shutting the PC down is never done on a word alone: this only opens the menu.
      case 'power': did = 'Power menu'; sendCommand('power'); break;
      case 'playThis': did = 'Play'; press('Enter'); break;
      case 'stop': did = 'Sleeping'; a.stopVoice(); break;
      case 'launch': {
        const g = games.find((x) => titleOf(x) === title);
        if (g) { did = `Playing ${titleOf(g)}`; a.launch(g); }
        break;
      }
    }
    setEcho({ said, did, at: Date.now() });
    playSound(did ? 'move' : 'error');
  }), []);

  useEffect(() => api.onVoiceState(setState), []);

  // Start, stop, and send the phrase list again whenever the games or the setting change.
  const names = games.map(titleOf).join('|');
  useEffect(() => {
    let dead = false;
    if (!on) { api.voiceStop().then((s) => !dead && setState(s)); return () => { dead = true; }; }
    const t = setTimeout(() => {
      api.voiceStart(list.current.map(titleOf), allowLaunch).then((s) => !dead && setState(s));
    }, 600); // the library settles first, so the recogniser is built once
    return () => { dead = true; clearTimeout(t); };
  }, [on, allowLaunch, names]);

  // Stop listening when Lumen closes.
  useEffect(() => {
    const off = () => { void api.voiceStop(); };
    window.addEventListener('beforeunload', off);
    return () => window.removeEventListener('beforeunload', off);
  }, []);

  return { state, echo };
}
