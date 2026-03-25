import { VersionInfo } from '@start9labs/start-sdk'

export const v_2_59_0_0_b3 = VersionInfo.of({
  version: '2.59.0:0-beta.3',
  releaseNotes: {
    en_US:
      'SDK beta.66 compatibility. ' +
      'Version directory restructure. ' +
      'Code polish for marketplace readiness.',
  },
  migrations: {
    up: async ({ effects }) => {
      // beta.2 → beta.3: No data changes — structural refactor only.
    },
    down: async ({ effects }) => {
      // beta.3 → beta.2: No destructive changes.
    },
  },
})
