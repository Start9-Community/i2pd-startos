import { torrc } from '../fileModels/torrc'
import { sdk } from '../sdk'

export const seedTorrc = sdk.setupOnInit(async (effects, kind) => {
  if (!kind) return

  // Ensure the torrc file exists with defaults on fresh install
  await torrc.merge(effects, {})
})
