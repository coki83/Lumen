import { useState } from 'react';
import { Modal } from '../components/ui';
import { api, isDesktop } from '../lib/api';
import { useLumen } from '../lib/store';

export function AddGame({ onClose }: { onClose(): void }) {
  const { notify } = useLumen();
  const [title, setTitle] = useState('');
  const [exe, setExe] = useState('');
  const [args, setArgs] = useState('');
  const browse = async () => {
    const f = await api.pickFile('exe');
    if (!f) return;
    setExe(f);
    if (!title) setTitle(f.split(/[\\/]/).pop()!.replace(/\.(exe|lnk|bat|cmd|url)$/i, '').replace(/[-_.]+/g, ' '));
  };
  const add = async () => {
    await api.addManualGame({ title: title.trim(), exe: exe.trim(), args });
    notify(`Added ${title.trim()}`);
    onClose();
  };
  return (
    <Modal
      title="Add a game"
      onClose={onClose}
      footer={<><div className="spacer" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!title.trim() || !exe.trim()} onClick={add}>Add to library</button></>}
    >
      <p className="hint">For anything the scanners don't find: emulators, itch.io downloads, DRM-free games, mods, or a shortcut.</p>
      <label className="field">
        <span>Program</span>
        <div className="inline">
          <input value={exe} onChange={(e) => setExe(e.target.value)} placeholder="C:\Games\MyGame\game.exe" />
          {isDesktop && <button className="btn" onClick={browse}>Browse</button>}
        </div>
      </label>
      <label className="field"><span>Name</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My game" /></label>
      <label className="field"><span>Arguments (optional)</span><input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-fullscreen" /></label>
    </Modal>
  );
}
