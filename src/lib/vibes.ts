// "Good vibes": a friendly read of the day, plus a few games from your own library that suit it.
// Lumen has no genre data for most games, so the picks come from how you play: what you love, what
// you've never started, what you haven't touched in a while. The weather sets one of the moods, and
// the rest come from the time of day and the shape of your library, so the card is not only a
// forecast. One mood per day, and you can step through the others yourself.
import type { Game, PulseKind, VibesMood, WeatherInfo } from '../../shared/types';
import { lastPlayedOf, minutesOf, titleOf } from './library';
import { t } from './i18n';

export interface Vibes {
  id: string;
  /** 'weather' for the sky mood, else the mood's own id. Settings pick a mood by this. */
  group: VibesMood;
  /** The small line above the title, e.g. "Good vibes" or "Positive vibes". */
  label: string;
  /** Icon name for that line. The weather mood leaves this out and uses the weather icon. */
  icon?: string;
  title: string;
  text: string;
  why: string;
  games: Game[];
  /** How many moods there are to step through right now. */
  count: number;
  /** Set when the card's content comes from Steam instead of the library. */
  online?: PulseKind;
}

/** Same order all day, a new one tomorrow. */
function shuffleToday<T>(list: T[], key: (t: T) => string): T[] {
  const day = Math.floor(Date.now() / 86_400_000);
  const h = (s: string) => { let x = day; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; };
  return [...list].sort((a, b) => h(key(a)) - h(key(b)));
}

/**
 * The card's mood. `offset` steps to the next mood, so the card can be cycled by hand without the
 * caller needing to know what the moods are.
 */
export function vibes(w: WeatherInfo | null, games: Game[], n = 6, offset = 0, prefer: VibesMood = 'auto'): Vibes | null {
  if (!games.length) return null;

  const played = games.filter((g) => minutesOf(g) > 0);
  const loved = [...played].sort((a, b) => minutesOf(b) - minutesOf(a)).slice(0, 24);
  const untouched = games.filter((g) => minutesOf(g) === 0);
  const monthAgo = Date.now() - 30 * 86_400_000;
  const dusty = played.filter((g) => (lastPlayedOf(g) ?? 0) < monthAgo && minutesOf(g) >= 60);
  const quick = played.filter((g) => minutesOf(g) < 300);
  const favs = games.filter((g) => g.overrides.favorite);
  const installed = games.filter((g) => g.installed);
  const ready = (l: Game[]) => { const inst = l.filter((g) => g.installed); return inst.length >= 3 ? inst : l; };
  const pick = (primary: Game[], ...more: Game[][]) => {
    const out: Game[] = [];
    for (const pool of [primary, ...more, games]) for (const g of shuffleToday(ready(pool), (x) => x.id + titleOf(x))) if (out.length < n && !out.includes(g)) out.push(g);
    return out;
  };

  // `auto` means the mood is in the daily rotation right now. A mood that is out of its hours is
  // still built, so picking it in Settings works at any time of day.
  type Mood = Omit<Vibes, 'count'> & { auto?: boolean };
  const moods: Mood[] = [];

  // 1. The weather, when we have it.
  if (w?.ok) {
    const deg = `${w.temp}°${w.unit === 'f' ? 'F' : 'C'}`;
    const wind = `${w.wind} ${w.unit === 'f' ? 'mph' : 'km/h'}`;
    const cold = w.unit === 'f' ? (w.temp ?? 0) < 41 : (w.temp ?? 0) < 5;
    const hot = w.unit === 'f' ? (w.temp ?? 0) > 82 : (w.temp ?? 0) > 28;
    const feels = w.feels !== undefined && Math.abs(w.feels - (w.temp ?? 0)) >= 2 ? `, feels like ${w.feels}°` : '';
    const facts = `${deg} and ${(w.label ?? '').toLowerCase()} in ${w.place}${feels}, wind ${wind}.`;
    const weatherMood = (): Mood => {
      switch (w.kind) {
        case 'rain':
          return { id: 'rain', group: 'weather', label: t('Good vibes'), title: t('Rainy day, stay in'), text: `${facts} ${t('Nothing to miss outside, so settle in for a long session.')}`, why: t('Games you have sunk the most hours into'), games: pick(loved, favs) };
        case 'storm':
          return { id: 'storm', group: 'weather', label: t('Good vibes'), title: t('Storm outside, lights low'), text: `${facts} ${t('Close the curtains and pick something you can get lost in.')}`, why: t('Your most played and favorite games'), games: pick([...favs, ...loved]) };
        case 'snow':
          return { id: 'snow', group: 'weather', label: t('Good vibes'), title: t('Snow day'), text: `${facts} ${t('Blanket, hot drink, and an old favorite.')}`, why: t('Your favorites, and games you loved but have not opened in a while'), games: pick(favs, dusty, loved) };
        case 'fog':
          return { id: 'fog', group: 'weather', label: t('Good vibes'), title: t('Foggy and quiet'), text: `${facts} ${t('A slow, calm kind of day. Good for something you left half finished.')}`, why: t('Games you have not played in over a month'), games: pick(dusty, loved) };
        case 'cloudy':
          return { id: 'cloudy', group: 'weather', label: t('Good vibes'), title: w.isDay ? t('Grey skies') : t('Cloudy night'), text: `${facts} ${cold ? t('Chilly out there.') : t('Nothing dramatic outside.')} ${t('A fine time to try something new from your shelf.')}`, why: t('Games you own but have never started'), games: pick(untouched, dusty) };
        default:
          if (!w.isDay) return { id: 'clear-night', group: 'weather', label: t('Good vibes'), title: t('Clear night'), text: `${facts} ${t('Calm and clear. Wind down with something familiar.')}`, why: t('Your favorites and most played'), games: pick(favs, loved) };
          return { id: 'clear', group: 'weather', label: t('Good vibes'), title: hot ? t('Hot and sunny') : t('Sunny outside'), text: `${facts} ${hot ? t('Too warm to do much.') : t('Worth a walk first.')} ${t('Keep it light with a short session.')}`, why: t('Games you dip into for shorter sessions'), games: pick(quick, untouched) };
      }
    };
    moods.push(weatherMood());
  }

  // 2. Moods that have nothing to do with the sky. Each one is only offered when it has games to
  // stand on, so a small library never lands on an empty card.
  const hour = new Date().getHours();
  const enough = (l: Game[]) => l.length >= 3;

  if (enough(favs) || enough(loved)) {
    moods.push({
      id: 'positive', group: 'positive', label: t('Positive vibes'), icon: 'sparkle', title: t('Something good today'),
      text: t('Whatever the day is doing, here are the ones that never let you down. Start one, no pressure to finish it.'),
      why: t('Your favorites and the games you keep coming back to'), games: pick([...favs, ...loved])
    });
  }
  if (enough(untouched)) {
    moods.push({
      id: 'fresh', group: 'fresh', label: t('Fresh start'), icon: 'sparkle', title: t('Something you have never opened'),
      text: `${t('You own {n} games you have never started.', { n: untouched.length })} ${t('Today is as good a day as any to meet one of them.')}`,
      why: t('Games you own but have never played'), games: pick(untouched)
    });
  }
  if (enough(dusty)) {
    moods.push({
      id: 'comeback', group: 'comeback', label: t('Comeback'), icon: 'refresh', title: t('Pick it back up'),
      text: t('These sat for a month or more, and you had already put real hours into them. The save is still there.'),
      why: t('Games you played a lot and then put down'), games: pick(dusty, loved)
    });
  }
  if (enough(quick)) {
    moods.push({
      id: 'quick', group: 'quick', label: t('Quick one'), icon: 'clock', title: t('Half an hour to spare'),
      text: t('Nothing that needs an evening. Something you can open, enjoy and close again.'),
      why: t('Games you tend to play in shorter sessions'), games: pick(quick, installed), auto: hour >= 6 && hour < 18
    });
  }
  if (enough(loved)) {
    moods.push({
      id: 'night', group: 'night', label: t('Late one'), icon: 'moon', title: t('Quiet hours'),
      text: t('Headphones on, brightness down. One of the ones you know by heart.'),
      why: t('Your most played games'), games: pick(loved, favs), auto: hour >= 21 || hour < 5
    });
  }
  if (enough(installed)) {
    moods.push({
      id: 'morning', group: 'morning', label: t('Morning vibes'), icon: 'sun', title: t('Coffee first'),
      text: t('An easy start to the day. These are already installed, so nothing to wait for.'),
      why: t('Games already installed on this PC'), games: pick(installed, quick), auto: hour >= 5 && hour < 11
    });
  }
  if (enough(loved)) {
    moods.push({
      id: 'deep', group: 'deep', label: t('Deep dive'), icon: 'heart', title: t('Clear an evening'),
      text: t('The long ones. Put the phone somewhere else and give one of these a proper run.'),
      why: t('The games you have spent the most time in'), games: pick(loved)
    });
  }

  // 3. The three moods that read from Steam rather than from your library. They carry no picks of
  // their own: the card fills itself from the live list.
  moods.push(
    {
      id: 'news', group: 'news', label: t('Game news'), icon: 'info', online: 'news', title: t('What is happening in gaming'),
      text: t('Headlines from the gaming press, gathered by Google News.'),
      why: t("Google News' gaming headlines"), games: []
    },
    {
      id: 'releases', group: 'releases', label: t('Just released'), icon: 'sparkle', online: 'releases', title: t('Fresh on Steam'),
      text: t('What came out in the last few days, straight from the Steam store.'),
      why: t("Steam's new releases"), games: []
    },
    {
      id: 'world', group: 'world', label: t('Most played'), icon: 'trophy', online: 'world', title: t('What the world is playing'),
      text: t('The ten games with the most people in them right now, everywhere.'),
      why: t("Steam's live most played chart"), games: []
    }
  );

  if (!moods.length) return null;
  // A mood chosen in Settings wins, as long as it still has games behind it today.
  if (prefer !== 'auto') {
    const want = moods.find((m) => m.group === prefer);
    if (want) return { ...want, count: moods.length };
  }
  const picked = moods.filter((m) => m.auto !== false);
  const rota = picked.length ? picked : moods;
  const day = Math.floor(Date.now() / 86_400_000);
  const i = (((day + offset) % rota.length) + rota.length) % rota.length;
  return { ...rota[i], count: rota.length };
}
