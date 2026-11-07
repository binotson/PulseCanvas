import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { PRODUCTION_CSP } from './src/shared/csp'

/**
 * Injects the strict production Content-Security-Policy as a <meta> tag at
 * build time (defence in depth — the main process also sends it as an HTTP
 * header from the app:// protocol handler). Dev builds skip this because the
 * Vite dev server needs inline HMR scripts; dev CSP is applied by the main
 * process instead.
 */
function cspMetaPlugin(): Plugin {
  return {
    name: 'pulsecanvas-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss(), cspMetaPlugin()],
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') }
    }
  }
})
