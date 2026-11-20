// The desktop sidebar's main items and the Big Screen tabs can be reordered and hidden in Settings → Menus.
export interface NavDef { id: string; label: string; icon: string; group: 'Library' | 'Explore' }

export const NAV_ITEMS: NavDef[] = [
  { id: 'home', label: 'Home', icon: 'home', group: 'Library' },
  { id: 'all', label: 'All games', icon: 'library', group: 'Library' },
  { id: 'favorites', label: 'Favorites', icon: 'star', group: 'Library' },
  { id: 'recent', label: 'Recently played', icon: 'clock', group: 'Library' },
  { id: 'emulation', label: 'Emulation', icon: 'joystick', group: 'Library' },
  { id: 'deals', label: 'Trending & deals', icon: 'tag', group: 'Explore' },
  { id: 'lookup', label: 'Game lookup', icon: 'search', group: 'Explore' },
  { id: 'web:steamdb', label: 'SteamDB', icon: 'info', group: 'Explore' },
  { id: 'web:steam', label: 'Steam store', icon: 'grid', group: 'Explore' },
  { id: 'web:epic', label: 'Epic store', icon: 'grid', group: 'Explore' },
  { id: 'web:ggdeals', label: 'GG.deals: buy games', icon: 'tag', group: 'Explore' }
];

/** Whole sidebar sections that can be hidden. */
export const NAV_SECTIONS = [
  { id: 'sec:launchers', label: 'Launchers list' },
  { id: 'sec:collections', label: 'Collections list' },
  { id: 'sec:drives', label: 'Drive space' },
  { id: 'sec:temps', label: 'Temperatures' }
];

export const BIG_TABS = [
  { id: 'Home', label: 'Home' },
  { id: 'Controller', label: 'Controller' },
  { id: 'Emulation', label: 'Emulation' },
  { id: 'Library', label: 'Library' },
  { id: 'Favorites', label: 'Favorites' }
];

/** Known ids in the saved order first, then any the saved order doesn't mention (new items after an update). */
export function ordered(ids: string[], order?: string[]): string[] {
  const o = (order ?? []).filter((id) => ids.includes(id));
  return [...o, ...ids.filter((id) => !o.includes(id))];
}
