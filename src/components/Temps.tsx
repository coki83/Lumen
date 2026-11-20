import { useEffect, useState } from 'react';
import type { TempReading } from '../../shared/types';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useLumen } from '../lib/store';
import { Icon } from './Icon';

const KIND_ICON: Record<TempReading['kind'], string> = { cpu: 'cpu', gpu: 'monitor', board: 'grid', disk: 'disk', other: 'thermo' };
const KIND_NAME: Record<TempReading['kind'], string> = { cpu: 'CPU', gpu: 'GPU', board: 'Motherboard', disk: 'Drive', other: 'Sensor' };
/** Warm and hot, per part: a drive at 60 °C is in trouble long before a CPU is. */
const LIMITS: Record<TempReading['kind'], [number, number]> = { cpu: [80, 90], gpu: [80, 90], board: [60, 75], disk: [50, 60], other: [70, 85] };

export function tempState(r: TempReading): string {
  const [warm, hot] = LIMITS[r.kind];
  return r.celsius >= hot ? 'hot' : r.celsius >= warm ? 'warm' : '';
}

/**
 * Reads the temperatures while the panel is on screen, then again every fifteen seconds. Each read
 * starts a PowerShell, so a minimized or hidden window asks for nothing: a launcher has no business
 * costing a game anything while you play.
 */
export function useTemps(on = true): { list: TempReading[]; note?: string } {
  const [state, setState] = useState<{ list: TempReading[]; note?: string }>({ list: [] });
  useEffect(() => {
    if (!on || !api.temps) return;
    let alive = true;
    const read = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      api.temps!().then((r) => alive && setState(r)).catch(() => {});
    };
    read();
    const again = window.setInterval(read, 15000);
    document.addEventListener('visibilitychange', read);
    return () => { alive = false; window.clearInterval(again); document.removeEventListener('visibilitychange', read); };
  }, [on]);
  return state;
}

/**
 * One line per part. A machine with a hardware monitor running reports a sensor per core and per
 * drive, which is far too much for a sidebar, so each kind is shown once with its hottest reading
 * and the rest sit in the tooltip.
 */
export function hottestPerKind(list: TempReading[]): TempReading[] {
  const best = new Map<string, TempReading>();
  for (const r of list) {
    const key = r.kind === 'disk' ? `disk:${r.label}` : r.kind;
    const prev = best.get(key);
    if (!prev || r.celsius > prev.celsius) best.set(key, r);
  }
  return [...best.values()];
}

export function TempRow({ r, all }: { r: TempReading; all: TempReading[] }) {
  const others = all.filter((x) => x.kind === r.kind);
  const title = others.map((x) => `${x.label}: ${Math.round(x.celsius)} °C`).join('\n');
  return (
    <div className={`temp ${tempState(r)}`} title={title}>
      <Icon name={KIND_ICON[r.kind]} size={14} />
      <b>{t(KIND_NAME[r.kind])}</b>
      <span className="temp-name">{r.kind === 'disk' ? r.label : others.length > 1 ? t('{n} sensors', { n: others.length }) : r.label}</span>
      <span className="temp-deg">{Math.round(r.celsius)}°</span>
    </div>
  );
}

/**
 * The chip in the Big Screen header: the two numbers that matter on a TV, CPU and graphics card,
 * where you can see them without opening the menu.
 */
export function TempChip() {
  const { settings } = useLumen();
  const on = settings.tempsOn !== false;
  const { list } = useTemps(on);
  if (!on || !list.length) return null;
  const pick = hottestPerKind(list).filter((r) => r.kind === 'cpu' || r.kind === 'gpu');
  const show = pick.length ? pick : hottestPerKind(list).slice(0, 2);
  // On a narrow screen the header cannot hold both and the tabs: there only the hottest of the two
  // is shown, which is the one worth looking at anyway. The rest is in the tooltip and in the menu.
  const lead = show.reduce((a, b) => (b.celsius > a.celsius ? b : a), show[0]);
  return (
    <span className="bs-temps" title={list.map((x) => `${x.label}: ${Math.round(x.celsius)} °C`).join('\n')}>
      <Icon name="thermo" size={20} />
      {show.map((r) => (
        <b key={r.kind} className={`${tempState(r)} ${r === lead ? 'lead' : ''}`}>
          {t(KIND_NAME[r.kind])} {Math.round(r.celsius)}°
        </b>
      ))}
    </span>
  );
}

/** The temperature list, used in the sidebar, in the Big Screen menu and in Settings. */
export function Temps({ always, showNote }: { always?: boolean; showNote?: boolean }) {
  const { settings } = useLumen();
  const on = always || settings.tempsOn !== false;
  const { list, note } = useTemps(on);
  if (!on) return null;
  if (!list.length) return showNote && note ? <p className="hint">{note}</p> : null;
  return (
    <div className="temps">
      {hottestPerKind(list).map((r) => <TempRow key={`${r.kind}:${r.label}`} r={r} all={list} />)}
    </div>
  );
}
