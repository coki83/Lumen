import type { LumenApi } from '../../shared/types';
import { createMockApi } from './mock';

declare global {
  interface Window {
    lumen?: LumenApi;
  }
}

export const api: LumenApi = window.lumen ?? createMockApi();
export const isDesktop = !!window.lumen;
