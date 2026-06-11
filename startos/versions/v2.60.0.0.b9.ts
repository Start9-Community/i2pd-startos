import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const v_2_60_0_0_b9 = VersionInfo.of({
  version: '2.60.0:0-beta.9',
  releaseNotes: {
    en_US: 'Updated to SDK beta.9',
    es_ES: 'Actualizado al SDK beta.9',
    de_DE: 'Auf SDK Beta 9 aktualisiert',
    pl_PL: 'Zaktualizowano do SDK beta.9',
    fr_FR: 'Mis à jour vers le SDK bêta.9',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
