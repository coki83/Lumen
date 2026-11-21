import { useEffect, useState, useMemo } from 'react';
import { Icon } from './Icon';
import type { CardStyle, Game } from '../../shared/types';
import { artOf, hueFor, titleOf } from '../lib/library';
import { SOURCES } from '../lib/sources';
import { t } from '../lib/i18n';
import { downloadLabel, downloadShort, downloadWaiting, useDownloadFor, useLumen } from '../lib/store';

const STEAM_ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';

/** Candidate cover URLs, best first. Each one that fails to load moves on to the next. */
export function coverChain(g: Game): string[] {
  const a = artOf(g);
  if (g.overrides.art?.cover) return [g.overrides.art.cover, ...(g.art.cover ? [g.art.cover] : [])];
  const list = [a.cover, ...(g.art.alts ?? [])];
  if (g.source === 'steam' && /^\d+$/.test(g.sourceGameId)) {
    const id = g.sourceGameId;
    list.push(a.cover?.replace('_2x.jpg', '.jpg'), `${STEAM_ASSETS}/${id}/library_600x900_2x.jpg`, `${STEAM_ASSETS}/${id}/library_600x900.jpg`);
  }
  return [...new Set(list.filter(Boolean) as string[])];
}

/** Wide artwork candidates, best first, and after them the covers the desktop view uses. */
export function wideChain(g: Game): { url: string; cover: boolean }[] {
  const a = artOf(g);
  const steamHeader = g.source === 'steam' && /^\d+$/.test(g.sourceGameId) ? `${STEAM_ASSETS}/${g.sourceGameId}/header.jpg` : undefined;
  const wide = [...new Set([a.hero, a.icon, steamHeader].filter(Boolean) as string[])];
  return [...wide.map((url) => ({ url, cover: false })), ...coverChain(g).filter((u) => !wide.includes(u)).map((url) => ({ url, cover: true }))];
}

export function SourceBadge({ source }: { source: Game['source'] }) {
  const s = SOURCES[source];
  const { icons } = useLumen();
  const icon = icons[source];
  if (icon) return <img className="badge-icon" src={icon} alt={s.name} title={s.name} draggable={false} />;
  return (
    <span className="badge" style={{ ['--b' as any]: s.color }} title={s.name}>
      {s.short}
    </span>
  );
}

export function FallbackArt({ g, wide = false, bare = false, under = false }: { g: Game; wide?: boolean; bare?: boolean; under?: boolean }) {
  const a = artOf(g);
  const h = hueFor(titleOf(g));
  const steamHeader = g.source === 'steam' && /^\d+$/.test(g.sourceGameId) ? `${STEAM_ASSETS}/${g.sourceGameId}/header.jpg` : undefined;
  const bg = under ? undefined : a.hero || a.icon || steamHeader;
  return (
    <div
      className={`fallback ${wide ? 'wide' : ''}`}
      style={{ ['--h' as any]: h, backgroundImage: bg ? `linear-gradient(180deg, transparent 30%, rgba(0,0,0,.75)), url("${bg}")` : undefined }}
    >
      {bare ? null : a.logo ? <img className="fb-logo" src={a.logo} alt="" draggable={false} /> : <span className="fb-title">{titleOf(g)}</span>}
    </div>
  );
}

export function Cover({ g, showTitle, showBadge, focused, style, onClick, onDoubleClick, onContextMenu }: {
  g: Game; showTitle?: boolean; showBadge?: boolean; focused?: boolean;
  /** Overrides the saved tile style, so a settings preview can show one without changing it. */
  style?: CardStyle;
  onClick?: () => void; onDoubleClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { settings } = useLumen();
  const dl = useDownloadFor(g.id);
  // Landscape tiles look best with the wide artwork; covers stay as the fallback.
  const wideArt = settings?.cardShape === 'landscape';
  const chain = useMemo(() => {
    const covers = coverChain(g);
    if (!wideArt || g.overrides.art?.cover) return covers;
    const steamHeader = g.source === 'steam' && /^\d+$/.test(g.sourceGameId) ? `${STEAM_ASSETS}/${g.sourceGameId}/header.jpg` : undefined;
    return [...new Set([artOf(g).hero, steamHeader, ...covers].filter(Boolean) as string[])];
  }, [g, wideArt]);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setIdx(0); setLoaded(false); }, [chain.join('|')]);
  const src = chain[idx];
  const cardStyle = style ?? settings?.cardStyle ?? 'classic';
  return (
    <div
      className={`card cs-${cardStyle} ${focused ? 'focused' : ''} ${g.installed ? '' : g.owned ? 'uninstalled' : 'missing'}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={-1}
      data-id={g.id}
    >
      <div className="art">
        {cardStyle === 'rgb' && <i className="rgb-ring" aria-hidden />}
        {cardStyle === 'rgb' && <i className="rgb-halo" aria-hidden />}
        {/* The disc goes before the artwork so it reads as sitting behind the cover, and inside
            .art so it is clipped by the tile rather than floating past its edge. */}
        {cardStyle === 'cd' && <i className="cd-disc" aria-hidden />}
        {src ? (
          <>
            {/* title card shows while the cover loads, or if it never does */}
            {!loaded && <FallbackArt g={g} under />}
            <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className={loaded ? 'in' : ''}
              onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setIdx((i) => i + 1); }} />
          </>
        ) : (
          <FallbackArt g={g} />
        )}
        {(cardStyle === 'dvd' || cardStyle === 'cd') && <i className="case-gloss" aria-hidden />}
        {showBadge && <SourceBadge source={g.source} />}
        <PadBadge g={g} />
        <DownloadOverlay g={g} />
        {g.overrides.favorite && <span className="fav-dot" title={t('Favorite')}>★</span>}
        {!g.installed && !dl && <span className="missing-tag">{g.owned ? t('Not installed') : t('Not found')}</span>}
      </div>
      {showTitle && <div className="card-title">{titleOf(g)}</div>}
    </div>
  );
}

/** Wide hero image with fallback to a blurred cover, used for detail pages and big-screen backgrounds. */
export function heroOf(g?: Game): string | undefined {
  if (!g) return undefined;
  const a = artOf(g);
  return a.hero || a.cover || g.art.alts?.[0];
}

export const PAD_LABEL = { full: 'Full controller support', partial: 'Partial controller support', none: 'No controller support' } as const;

/** Small gamepad mark for games that play with a controller. Only shown in Big Screen (see CSS). */
export function PadBadge({ g }: { g: Game }) {
  if (g.controller !== 'full' && g.controller !== 'partial') return null;
  return (
    <span className={`pad-badge ${g.controller}`} title={t(PAD_LABEL[g.controller])}>
      <Icon name="gamepad" size={20} />
      {g.controller === 'partial' && <i>½</i>}
    </span>
  );
}

/** The progress bar on a tile while its launcher is downloading or installing the game. */
export function DownloadOverlay({ g }: { g: Game }) {
  const d = useDownloadFor(g.id);
  if (!d) return null;
  return (
    <div className={`dl-overlay${downloadWaiting(d.state) ? ' waiting' : ''}`} title={downloadLabel(d)}>
      <div className="dl-bar"><i style={{ width: `${d.percent ?? 4}%` }} className={d.percent === undefined ? 'wait' : ''} /></div>
      <span className="dl-pct">{downloadShort(d)}</span>
    </div>
  );
}
