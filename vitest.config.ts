import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const testEnvironment = fileURLToPath(new URL('./scripts/test-env.ts', import.meta.url))

export default defineConfig({
  test: {
    setupFiles: [testEnvironment],
  },
})
