import type { SourceId } from '../../shared/types';

export const SOURCES: Record<SourceId, { name: string; short: string; color: string }> = {
  steam: { name: 'Steam', short: 'ST', color: '#4f8fd6' },
  epic: { name: 'Epic Games', short: 'EP', color: '#6b6b78' },
  gog: { name: 'GOG', short: 'GG', color: '#a35bd6' },
  ea: { name: 'EA app', short: 'EA', color: '#ff5a5a' },
  ubisoft: { name: 'Ubisoft Connect', short: 'UB', color: '#3a8bff' },
  xbox: { name: 'Xbox / Microsoft Store', short: 'XB', color: '#3fae4a' },
  battlenet: { name: 'Battle.net', short: 'BN', color: '#26a5f2' },
  amazon: { name: 'Amazon Games', short: 'AG', color: '#ff9f1c' },
  quiver: { name: 'Quiver Launcher', short: 'QV', color: '#59c3a0' },
  manual: { name: 'Added by you', short: 'ME', color: '#c9b38a' }
};

export const SOURCE_ORDER: SourceId[] = ['steam', 'epic', 'gog', 'ea', 'ubisoft', 'xbox', 'battlenet', 'amazon', 'quiver', 'manual'];
