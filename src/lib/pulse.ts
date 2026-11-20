// The live lists behind the vibes card and the screensaver: news about your games, Steam's new
// releases, and the games the world is playing right now. The fetching itself happens in the main
// process (electron/pulse.ts); this only keeps what came back.
import { useEffect, useState } from 'react';
import type { PulseItem, PulseKind } from '../../shared/types';
import { api } from './api';

/** Reads one of the live lists (news, new releases, world chart) for the vibes card. */
export function usePulse(kind: PulseKind | undefined) {
  const [state, setState] = useState<{ kind?: PulseKind; items: PulseItem[]; loading: boolean }>({ items: [], loading: !!kind });
  useEffect(() => {
    if (!kind) { setState({ items: [], loading: false }); return; }
    let live = true;
    setState((was) => ({ kind, items: was.kind === kind ? was.items : [], loading: true }));
    api.pulse?.(kind).then((items) => live && setState({ kind, items: items ?? [], loading: false })).catch(() => live && setState({ kind, items: [], loading: false }));
    return () => { live = false; };
  }, [kind]);
  return state;
}


/**
 * A slow carousel over a list: which slice to show right now, and whether it is mid fade. The card
 * uses it so headlines and picks keep moving instead of sitting there all evening.
 */
export function useCycle(total: number, size: number, ms = 6000) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  const [page, setPage] = useState(0);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    setPage(0);
    if (pages < 2) return;
    const step = window.setInterval(() => {
      setFade(true);
      window.setTimeout(() => { setPage((p) => (p + 1) % pages); setFade(false); }, 420);
    }, ms);
    return () => window.clearInterval(step);
  }, [pages, ms]);
  const at = Math.min(page, pages - 1);
  return { from: at * size, page: at, pages, fade };
}
