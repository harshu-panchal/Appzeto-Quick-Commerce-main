import fs from 'fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const firebaseSwTemplatePath = path.resolve(__dirname, './src/sw/firebase-messaging-sw.js')

function renderFirebaseMessagingSw(mode) {
  const env = loadEnv(mode, __dirname, '')
  const template = fs.readFileSync(firebaseSwTemplatePath, 'utf8')
  const replacements = {
    __VITE_FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY || '',
    __VITE_FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    __VITE_FIREBASE_DATABASE_URL__: env.VITE_FIREBASE_DATABASE_URL || '',
    __VITE_FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID || '',
    __VITE_FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    __VITE_FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    __VITE_FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID || '',
    __VITE_FIREBASE_MEASUREMENT_ID__: env.VITE_FIREBASE_MEASUREMENT_ID || '',
  }

  return Object.entries(replacements).reduce(
    (output, [token, value]) => output.replaceAll(token, value),
    template,
  )
}

function firebaseMessagingSwPlugin() {
  let mode = 'development'

  return {
    name: 'firebase-messaging-sw',
    configResolved(config) {
      mode = config.mode
    },
    configureServer(server) {
      server.middlewares.use('/firebase-messaging-sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(renderFirebaseMessagingSw(mode))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: renderFirebaseMessagingSw(mode),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), firebaseMessagingSwPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@modules': path.resolve(__dirname, './src/modules'),
    },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (
            id.includes('@mui/material') ||
            id.includes('@mui/icons-material') ||
            id.includes('@emotion/react') ||
            id.includes('@emotion/styled')
          ) {
            return 'vendor-mui'
          }

          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('recharts')) return 'vendor-charts'
        },
      },
    },
  },
})
