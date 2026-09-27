import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites under /<repo>/. The deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH || '/';
const version = (process.env.GITHUB_SHA || '').slice(0, 7) || 'dev';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // src/pwa.js registers the worker and polls for updates
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Family To-Do',
        short_name: 'Family',
        description: 'Shared to-do and shopping lists for your family.',
        theme_color: '#4f46e5',
        background_color: '#f6f6f9',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
