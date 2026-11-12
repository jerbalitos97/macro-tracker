import { defineConfig } from 'vitest/config'

// Yksikkötestit. e2e/*.spec.ts ovat Playwrightin (npm run test:smoke),
// joten ne rajataan pois.
export default defineConfig({
  test: {
    include: ['api/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
})
