import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP for the packaged app only; the dev server needs inline scripts for hot reload.
const csp: Plugin = {
  name: 'lumen-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob: https: lumen-img:; media-src 'self' data: blob: https: lumen-img:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' lumen-img:" />`
    )
};

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), csp],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true }
});
