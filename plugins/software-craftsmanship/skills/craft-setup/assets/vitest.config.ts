import { defineConfig } from 'vitest/config'
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
  test: {
    globals: true,
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/infrastructure/**', 'src/application/**'],
      // The craft loop gates every iteration on this threshold.
      // Use cases and the UseCaseFactory live in src/domain, so they are gated too.
      // An uncovered domain branch is code nobody asked for.
      thresholds: {
        '**/src/domain/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
})
