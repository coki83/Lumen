import { useState } from 'react';
import type { PowerAction } from '../../shared/types';
import { api, isDesktop } from '../lib/api';
import { usePad, type PadAction } from '../lib/gamepad';
import { playSound } from '../lib/sound';
import { t } from '../lib/i18n';
import { useLumen } from '../lib/store';
import { Icon } from './Icon';

type Item = { id: PowerAction | 'exitBig' | 'cancel'; label: string; icon: string; hint?: string };

export function PowerMenu({ big, onClose, onExitBig }: { big?: boolean; onClose(): void; onExitBig?(): void }) {
  const { settings, notify } = useLumen();
  const items: Item[] = [
    { id: 'sleep', label: t('Sleep'), icon: 'moon', hint: 'Stand by, wakes where you left off' },
    { id: 'lock', label: 'Lock', icon: 'lock' },
    { id: 'restart', label: t('Restart'), icon: 'refresh' },
    { id: 'shutdown', label: t('Shut down'), icon: 'power' },
    ...(big ? [{ id: 'exitBig' as const, label: t('Exit Big Screen'), icon: 'monitor' }] : []),
    { id: 'quit', label: t('Close Lumen'), icon: 'close' },
    { id: 'cancel', label: t('Cancel'), icon: 'chevronLeft' }
  ];
  const [idx, setIdx] = useState(0);
  const [confirm, setConfirm] = useState<Item | null>(null);
  const [confirmIdx, setConfirmIdx] = useState(0);

  const run = async (it: Item) => {
    if (it.id === 'cancel') return onClose();
    if (it.id === 'exitBig') {
      onClose();
      return onExitBig?.();
    }
    if ((it.id === 'shutdown' || it.id === 'restart') && settings.confirmPower && !confirm) {
      setConfirm(it);
      setConfirmIdx(0);
      return;
    }
    playSound('power');
    const r = await api.power(it.id);
    if (!r.ok) notify(r.error ?? 'That did not work');
    onClose();
  };

  usePad((a: PadAction) => {
    if (confirm) {
      if (a === 'left' || a === 'right' || a === 'up' || a === 'down') { setConfirmIdx((i) => 1 - i); playSound('move'); }
      else if (a === 'a') confirmIdx === 1 ? run(confirm) : setConfirm(null);
      else if (a === 'b') setConfirm(null);
      return;
    }
    if (a === 'up' || a === 'left') { setIdx((i) => (i + items.length - 1) % items.length); playSound('move'); }
    else if (a === 'down' || a === 'right') { setIdx((i) => (i + 1) % items.length); playSound('move'); }
    else if (a === 'a') { playSound('select'); run(items[idx]); }
    else if (a === 'b' || a === 'select') { playSound('back'); onClose(); }
  });

  return (
    <div className={`power-backdrop ${big ? 'big' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="power" role="dialog" aria-label="Power">
        {!confirm ? (
          <>
            <h2><Icon name="power" size={22} /> Power</h2>
            {!isDesktop && <p className="hint">Sleep, restart and shut down work in the Windows app.</p>}
            <div className="power-list">
              {items.map((it, i) => (
                <button key={it.id} className={`power-item ${i === idx ? 'focused' : ''} ${it.id === 'shutdown' ? 'danger' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => run(it)}>
                  <Icon name={it.icon} size={22} />
                  <span><b>{it.label}</b>{it.hint && <small>{it.hint}</small>}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="power-confirm">
            <Icon name={confirm.icon} size={40} />
            <h2>{confirm.id === 'shutdown' ? 'Shut down your PC?' : 'Restart your PC?'}</h2>
            <p className="hint">Save your work in other apps first. Windows will close everything.</p>
            <div className="row-btns">
              <button className={`power-item ${confirmIdx === 0 ? 'focused' : ''}`} onMouseEnter={() => setConfirmIdx(0)} onClick={() => setConfirm(null)}><b>Cancel</b></button>
              <button className={`power-item danger ${confirmIdx === 1 ? 'focused' : ''}`} onMouseEnter={() => setConfirmIdx(1)} onClick={() => run(confirm)}><b>{confirm.label}</b></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
