export const normTitle = (t: string) => t.toLowerCase().replace(/[®™©:'’\-–—!.,]/g, '').replace(/\s+/g, ' ').trim();
