import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      // Force CJS output regardless of the root package.json's "type":
      // "module". Electron's sandboxed preload has had rough edges with ESM
      // across versions; plain CJS (.js) is the battle-tested path and
      // matches the '../preload/index.js' path notchWindow.ts loads.
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          identity: resolve('src/preload/identity.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
