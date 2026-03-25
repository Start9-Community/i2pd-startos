import { i2pdConfig, syncConfigToFiles } from '../fileModels/i2pd'
import { sdk } from '../sdk'

export const seedI2pdConfig = sdk.setupOnInit(async (effects, kind) => {
  // Always ensure clean default config exists
  const defaultConfig = {
    i2pServices: {},
    floodfill: { enabled: false },
    router: {
      bandwidth: 'O' as const,
      transit: true,
      loglevel: 'warn' as const,
    },
  }
  
  // On install, write fresh defaults
  // On update/restore, re-sync existing config to .conf files (picks up generator fixes)
  if (kind === 'install') {
    await i2pdConfig.write(effects, defaultConfig)
    await syncConfigToFiles(defaultConfig)
  } else {
    const config = await i2pdConfig.read().once()
    if (config) {
      await syncConfigToFiles(config)
    } else {
      await i2pdConfig.write(effects, defaultConfig)
      await syncConfigToFiles(defaultConfig)
    }
  }
})
