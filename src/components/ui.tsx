import { useEffect, useRef, type ReactNode } from 'react';
import { useWindowNav } from '../lib/spatial';
import { Icon } from './Icon';

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose(): void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  // Windows take controller input themselves: the stick moves through the controls, A presses.
  const box = useRef<HTMLDivElement>(null);
  const pad = useWindowNav(box, onClose);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} ref={box}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
        {pad && (
          <div className="modal-hints">
            <span><b className="bs-hint-btn">Stick</b> Move</span><span><b className="bs-hint-btn">A</b> Select</span>
            <span><b className="bs-hint-btn">LB</b> / <b className="bs-hint-btn">RB</b> Tabs</span><span><b className="bs-hint-btn">B</b> Back</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange(v: boolean): void; label: string; hint?: string }) {
  return (
    <label className="row toggle-row">
      <span>
        <span className="lbl">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </label>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange(v: number): void; format?(v: number): string }) {
  return (
    <label className="row slider-row">
      <span className="lbl">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{format ? format(value) : value}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange(v: T): void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
