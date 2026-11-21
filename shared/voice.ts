/**
 * What Lumen listens for.
 *
 * Nothing happens unless the wake words come first, so the room can talk without setting the
 * launcher off. The same table builds the grammar the Windows recogniser is given and decides
 * what a heard phrase does, so the two can never drift apart.
 */

/** Said before every command. Anything that does not start with this is thrown away. */
export const VOICE_WAKE = 'ok lumen';

/** The words that can come before a game's name. */
export const VOICE_PLAY_WORDS = ['play', 'start', 'launch'];

export interface VoiceCommand {
  id: string;
  /** What it does, for the list in Settings. */
  what: string;
  /** Every way of saying it. The first one is the one Settings shows. */
  phrases: string[];
}

export const VOICE_COMMANDS: VoiceCommand[] = [
  { id: 'home', what: 'Go to Home', phrases: ['home', 'go home'] },
  { id: 'library', what: 'Open the library', phrases: ['library', 'open library', 'show my games'] },
  { id: 'favorites', what: 'Open favourites', phrases: ['favorites', 'open favorites'] },
  { id: 'search', what: 'Start a search', phrases: ['search', 'find a game'] },
  { id: 'settings', what: 'Open Settings', phrases: ['settings', 'open settings'] },
  { id: 'rescan', what: 'Scan for games again', phrases: ['scan for games', 'refresh my library'] },
  { id: 'bigOn', what: 'Go to Big Screen', phrases: ['big screen', 'big picture mode'] },
  { id: 'bigOff', what: 'Leave Big Screen', phrases: ['exit big screen', 'leave big screen', 'go to desktop'] },
  { id: 'playThis', what: 'Play the game you are on', phrases: ['play this', 'play this game'] },
  { id: 'select', what: 'Pick what you are on', phrases: ['select', 'confirm'] },
  { id: 'back', what: 'Go back', phrases: ['back', 'go back'] },
  { id: 'up', what: 'Move up', phrases: ['move up', 'go up'] },
  { id: 'down', what: 'Move down', phrases: ['move down', 'go down'] },
  { id: 'left', what: 'Move left', phrases: ['move left', 'go left'] },
  { id: 'right', what: 'Move right', phrases: ['move right', 'go right'] },
  { id: 'musicOn', what: 'Start the music', phrases: ['music on', 'play music'] },
  { id: 'musicOff', what: 'Stop the music', phrases: ['music off', 'stop the music'] },
  { id: 'power', what: 'Open the power menu', phrases: ['power menu', 'power options'] },
  { id: 'stop', what: 'Stop listening', phrases: ['stop listening', 'go to sleep'] }
];

/** Every phrase the recogniser is allowed to hear, the wake words apart. */
export function voicePhrases(gameTitles: string[], allowLaunch: boolean): string[] {
  const out = VOICE_COMMANDS.flatMap((c) => c.phrases);
  if (allowLaunch) {
    for (const title of gameTitles) {
      const clean = cleanTitle(title);
      if (!clean) continue;
      for (const w of VOICE_PLAY_WORDS) out.push(`${w} ${clean}`);
    }
  }
  return [...new Set(out)];
}

/**
 * A title the recogniser can be given. Its grammar takes words, so punctuation, numerals and
 * anything that is not a letter would either be read out oddly or throw the phrase out.
 */
export function cleanTitle(title: string): string {
  const t = title
    .replace(/[™®©]/g, ' ')
    .replace(/['\u2019]/g, '')            // Director's Cut, not Director s Cut
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // A lone digit is said as a word, so the grammar and the match have to agree on which.
    .replace(/\b([0-9])\b/g, (_m, d) => DIGITS[Number(d)]);
  return t.length < 2 || t.length > 60 ? '' : t;
}

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export interface VoiceHeard {
  /** What was said, the wake words already taken off. */
  said: string;
  /** A command id, or 'launch' when a game was named, or null when nothing matched. */
  id: string | null;
  /** The cleaned game title, when id is 'launch'. */
  title?: string;
}

/** Works out what a heard phrase means. Game titles are matched on their cleaned form. */
export function readVoice(text: string, gameTitles: string[]): VoiceHeard {
  let said = text.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
  if (said.startsWith(VOICE_WAKE)) said = said.slice(VOICE_WAKE.length).trim();
  for (const c of VOICE_COMMANDS) if (c.phrases.includes(said)) return { said, id: c.id };
  for (const w of VOICE_PLAY_WORDS) {
    if (!said.startsWith(`${w} `)) continue;
    const rest = said.slice(w.length + 1).trim();
    const hit = gameTitles.find((t) => cleanTitle(t) === rest);
    if (hit) return { said, id: 'launch', title: hit };
  }
  return { said, id: null };
}
