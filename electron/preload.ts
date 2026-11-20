import { contextBridge, ipcRenderer } from 'electron';
import type { Download, LibraryState, LumenApi } from '../shared/types';

const api: LumenApi = {
  platform: process.platform,
  getLibrary: () => ipcRenderer.invoke('library:get'),
  scan: () => ipcRenderer.invoke('library:scan'),
  launch: (id) => ipcRenderer.invoke('game:launch', id),
  uninstall: (id) => ipcRenderer.invoke('game:uninstall', id),
  achievements: (id) => ipcRenderer.invoke('game:achievements', id),
  updateGame: (id, patch) => ipcRenderer.invoke('game:update', id, patch),
  addManualGame: (input) => ipcRenderer.invoke('game:addManual', input),
  removeGame: (id) => ipcRenderer.invoke('game:remove', id),
  setCategories: (c) => ipcRenderer.invoke('categories:set', c),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (p) => ipcRenderer.invoke('settings:save', p),
  pickFile: (k) => ipcRenderer.invoke('dialog:pick', k),
  importArt: (f) => ipcRenderer.invoke('art:import', f),
  searchArt: (q) => ipcRenderer.invoke('art:search', q),
  listArt: (id, k) => ipcRenderer.invoke('art:list', id, k),
  freeArt: (q) => ipcRenderer.invoke('art:free', q),
  fixArt: () => ipcRenderer.invoke('art:fix'),
  lookup: (q) => ipcRenderer.invoke('lookup:search', q),
  lookupDetails: (id) => ipcRenderer.invoke('lookup:details', id),
  saveText: (n, c) => ipcRenderer.invoke('file:saveText', n, c),
  openFolder: (p) => ipcRenderer.invoke('shell:openFolder', p),
  power: (a) => ipcRenderer.invoke('power', a),
  gameInfo: (id, refresh) => ipcRenderer.invoke('game:info', id, refresh),
  setGlobalShortcut: (a) => ipcRenderer.invoke('shortcut:global', a),
  accounts: () => ipcRenderer.invoke('accounts:list'),
  launcherIcons: () => ipcRenderer.invoke('launcher:icons'),
  signIn: (id) => ipcRenderer.invoke('accounts:signIn', id),
  signOut: (id) => ipcRenderer.invoke('accounts:signOut', id),
  deals: (r) => ipcRenderer.invoke('store:deals', r),
  pulse: (kind, r) => ipcRenderer.invoke('store:pulse', kind, r),
  onToggleBigScreen: (cb) => {
    const h = () => cb();
    ipcRenderer.on('app:toggleBigScreen', h);
    return () => ipcRenderer.removeListener('app:toggleBigScreen', h);
  },
  setFullscreen: (on) => ipcRenderer.invoke('window:fullscreen', on),
  weather: (f) => ipcRenderer.invoke('weather', f),
  drives: (r) => ipcRenderer.invoke('sys:drives', r),
  temps: (r) => ipcRenderer.invoke('sys:temps', r),
  padBattery: (r) => ipcRenderer.invoke('pad:battery', r),
  downloads: () => ipcRenderer.invoke('downloads:get'),
  clearDownload: (id) => ipcRenderer.invoke('downloads:clear', id),
  openDownloads: (source) => ipcRenderer.invoke('downloads:open', source),
  downloadsLauncher: (source) => ipcRenderer.invoke('downloads:launcher', source),
  bigScreenActive: (on) => ipcRenderer.invoke('app:bigscreen', on),
  onDownloads: (cb) => {
    const h = (_e: unknown, d: Download[]) => cb(d);
    ipcRenderer.on('downloads:changed', h);
    return () => ipcRenderer.removeListener('downloads:changed', h);
  },
  couchStatus: () => ipcRenderer.invoke('couch:status'),
  couchSetup: (on) => ipcRenderer.invoke('couch:setup', on),
  couchOpen: (what) => ipcRenderer.invoke('couch:open', what),
  quit: () => ipcRenderer.invoke('app:quit'),
  onLibraryChanged: (cb) => {
    const h = (_e: unknown, s: LibraryState) => cb(s);
    ipcRenderer.on('library:changed', h);
    return () => ipcRenderer.removeListener('library:changed', h);
  }
};

contextBridge.exposeInMainWorld('lumen', api);
