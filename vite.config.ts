import { defineConfig, type PluginOption } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// dev 専用: 本番は認証付き Cloud Function が配信する私的データを、
// ローカルファイルから (emulator 無し・認証不要で) 返すミドルウェア。
// build には一切含まれない (apply: 'serve')。
function devPrivateApi(): PluginOption {
  const files: Record<string, string> = {
    '/api/app/data': 'private/data.json',
    '/api/app/stats': 'src/visualize-words.data.json',
  }
  return {
    name: 'dev-private-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        const file = files[path]
        if (!file) return next()
        try {
          const body = readFileSync(resolve(process.cwd(), file), 'utf8')
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(body)
        } catch {
          res.statusCode = 500
          res.end('{"error":"private_data_unavailable — run `nr build:data`"}')
        }
      })
    },
  }
}

export default defineConfig({
  logLevel: 'warn',
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001/anoz-memosupo/asia-northeast1/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    devPrivateApi(),
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'android-chrome-*.png',
      ],
      manifest: {
        name: '999 暗記',
        short_name: '999',
        description: '数字・年号・カード暗記アプリ',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        // 辞書は静的配信しない (認証付き /api/app/data)。
        // /api/** は SW でキャッシュせず、常にネットワーク (no-store) に委ねる。
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
