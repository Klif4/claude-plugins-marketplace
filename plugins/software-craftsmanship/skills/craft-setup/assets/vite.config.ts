import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const resolvePath = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolvePath('./src/domain'),
      '@application': resolvePath('./src/application'),
      '@infrastructure': resolvePath('./src/infrastructure'),
    },
  },
  build: {
    target: 'es2022',
    lib: {
      entry: resolvePath('./src/index.ts'),
      formats: ['es'],
    },
  },
})
