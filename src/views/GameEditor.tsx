import { useEffect, useState } from 'react';
import type { ArtCandidate, ArtSearchResult, ArtSet, Artwork, LaunchSpec } from '../../shared/types';
import { Icon } from '../components/Icon';
import { Modal, Segmented } from '../components/ui';
import { api, isDesktop } from '../lib/api';
import { titleOf } from '../lib/library';
import { useLumen } from '../lib/store';

type Slot = 'cover' | 'hero' | 'logo';

export function GameEditor({ id, onClose }: { id: string; onClose(): void }) {
  const { library, update, notify } = useLumen();
  const g = library.games.find((x) => x.id === id);
  const [title, setTitle] = useState(g?.overrides.title ?? '');
  const [art, setArt] = useState<Artwork>(g?.overrides.art ?? {});
  const [launchOn, setLaunchOn] = useState(!!g?.overrides.launch);
  const [launch, setLaunch] = useState<LaunchSpec>(g?.overrides.launch ?? g?.launch ?? { kind: 'exe', target: '' });
  const [argsText, setArgsText] = useState((g?.overrides.launch?.args ?? g?.launch.args ?? []).join(' '));
  const [picker, setPicker] = useState<Slot | null>(null);
  if (!g) return null;
  const effective = { ...g.art, ...art };

  const save = async () => {
    await update(g.id, {
      title: title.trim(),
      art: { cover: art.cover ?? '', hero: art.hero ?? '', logo: art.logo ?? '' },
      launch: launchOn ? { ...launch, args: argsText.split(' ').filter(Boolean) } : undefined
    });
    notify('Saved');
    onClose();
  };

  const fromFile = async (slot: Slot) => {
    const f = await api.pickFile('image');
    if (f) setArt({ ...art, [slot]: await api.importArt(f) });
  };

  const slot = (s: Slot, label: string, hint: string) => (
    <div className={`art-slot ${s}`}>
      <div className="art-preview">
        {effective[s] ? <img src={effective[s]} alt="" onError={(e) => (e.currentTarget.style.opacity = '0.15')} /> : <span className="muted">No {label.toLowerCase()}</span>}
      </div>
      <div className="art-ctl">
        <b>{label}</b>
        <span className="hint">{hint}</span>
        <input placeholder="Paste an image URL" value={art[s] ?? ''} onChange={(e) => setArt({ ...art, [s]: e.target.value })} />
        <div className="row-btns">
          <button className="btn small" onClick={() => fromFile(s)} disabled={!isDesktop}><Icon name="image" size={14} /> From file</button>
          <button className="btn small" onClick={() => setPicker(s)}><Icon name="search" size={14} /> Find online</button>
          {art[s] && <button className="btn small ghost" onClick={() => setArt({ ...art, [s]: '' })}>Reset</button>}
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      title={`Edit ${titleOf(g)}`}
      onClose={onClose}
      wide
      footer={
        <>
          {g.source === 'manual' && (
            <button className="btn danger" onClick={async () => { await api.removeGame(g.id); onClose(); }}><Icon name="trash" size={14} /> Remove game</button>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <label className="field">
        <span>Display name</span>
        <input value={title} placeholder={g.title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <h4>Artwork</h4>
      <div className="art-slots">
        {slot('cover', 'Cover', 'Portrait, around 600×900')}
        {slot('hero', 'Background', 'Wide, around 1920×620')}
        {slot('logo', 'Logo', 'Transparent PNG, shown over the background')}
      </div>
      <h4>Launch</h4>
      <label className="row toggle-row">
        <span><span className="lbl">Use a custom launch command</span><span className="hint">Default: {g.launch.kind === 'url' ? g.launch.target : `${g.launch.target} ${(g.launch.args ?? []).join(' ')}`}</span></span>
        <button type="button" role="switch" aria-checked={launchOn} className={`switch ${launchOn ? 'on' : ''}`} onClick={() => setLaunchOn(!launchOn)}><i /></button>
      </label>
      {launchOn && (
        <div className="launch-edit">
          <Segmented value={launch.kind} onChange={(k) => setLaunch({ ...launch, kind: k })} options={[{ value: 'exe', label: 'Program' }, { value: 'url', label: 'Link / protocol' }]} />
          <div className="inline">
            <input value={launch.target} onChange={(e) => setLaunch({ ...launch, target: e.target.value })} placeholder={launch.kind === 'exe' ? 'C:\\Games\\Game\\game.exe' : 'steam://rungameid/…'} />
            {launch.kind === 'exe' && isDesktop && <button className="btn small" onClick={async () => { const f = await api.pickFile('exe'); if (f) setLaunch({ ...launch, target: f }); }}>Browse</button>}
          </div>
          {launch.kind === 'exe' && <input value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder="Arguments, e.g. -windowed -skipintro" />}
        </div>
      )}
      {picker && <ArtPicker initial={titleOf(g)} kind={picker} onClose={() => setPicker(null)} onPick={(u) => { setArt({ ...art, [picker]: u }); setPicker(null); }} />}
    </Modal>
  );
}

function ArtPicker({ initial, kind, onClose, onPick }: { initial: string; kind: Slot; onClose(): void; onPick(u: string): void }) {
  const [q, setQ] = useState(initial);
  const [free, setFree] = useState<ArtSet[] | null>(null);
  const [hits, setHits] = useState<ArtSearchResult[] | null>(null);
  const [items, setItems] = useState<ArtCandidate[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { settings } = useLumen();
  const slotOf = (s: ArtSet) => (kind === 'cover' ? s.cover : kind === 'hero' ? s.hero : s.logo);
  const search = async (term = q) => {
    setBusy(true); setErr(''); setItems(null); setHits(null);
    const [f, g] = await Promise.allSettled([api.freeArt(term), settings.steamGridDbKey ? api.searchArt(term) : Promise.resolve([])]);
    setFree(f.status === 'fulfilled' ? f.value.filter(slotOf) : []);
    if (g.status === 'fulfilled') setHits(g.value); else setErr(String((g.reason as any)?.message ?? g.reason));
    setBusy(false);
  };
  useEffect(() => { search(initial); }, []);
  const open = async (id: number) => {
    setBusy(true); setErr('');
    try { setItems(await api.listArt(id, kind)); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Find ${kind === 'hero' ? 'background' : kind} artwork`} onClose={onClose} wide>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn primary" disabled={busy}>Search</button>
      </form>
      {busy && <p className="muted">Searching Steam, Epic and GOG…</p>}
      {free && (
        <>
          <h4>From the stores (free)</h4>
          {free.length === 0 ? <p className="muted">No store has {kind} art under this name. Try a shorter name.</p> : (
            <div className={`art-results ${kind}`}>
              {free.map((f, i) => (
                <button key={i} className="art-result" onClick={() => onPick(slotOf(f)!)} title={`${f.name} (${f.store})`}>
                  <img src={slotOf(f)} alt="" loading="lazy" />
                  <span className="art-src">{f.store} · {f.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <h4>SteamGridDB (community art)</h4>
      {!settings.steamGridDbKey ? <p className="hint">Optional: add a free SteamGridDB API key in Settings → Artwork for thousands of fan-made covers.</p> : (
        <>
          {hits && !items && (
            <div className="hits">
              {hits.length === 0 && <p className="muted">No matches.</p>}
              {hits.map((h) => <button key={h.gameId} className="btn" onClick={() => open(h.gameId)}>{h.name}</button>)}
            </div>
          )}
          {items && (
            <div className={`art-results ${kind}`}>
              {items.length === 0 && <p className="muted">No {kind} art for this game yet.</p>}
              {items.map((i) => (
                <button key={i.url} className="art-result" onClick={() => onPick(i.url)}>
                  <img src={i.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {err && <p className="error">{err}</p>}
    </Modal>
  );
}
