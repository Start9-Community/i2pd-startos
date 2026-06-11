import { i2pdConfig, generateI2pdConf, generateTunnelsConf } from '../fileModels/i2pd'
import { writeFile } from 'fs/promises'
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
    await sdk.volumes.i2pd.writeFile('etc/i2pd/i2pd.conf', generateI2pdConf(defaultConfig))
    await sdk.volumes.i2pd.writeFile('etc/i2pd/tunnels.conf', generateTunnelsConf(defaultConfig))
  } else {
    const config = await i2pdConfig.read().once()
    if (config) {
      await sdk.volumes.i2pd.writeFile('etc/i2pd/i2pd.conf', generateI2pdConf(config))
      await sdk.volumes.i2pd.writeFile('etc/i2pd/tunnels.conf', generateTunnelsConf(config))
    } else {
      await i2pdConfig.write(effects, defaultConfig)
      await sdk.volumes.i2pd.writeFile('etc/i2pd/i2pd.conf', generateI2pdConf(defaultConfig))
      await sdk.volumes.i2pd.writeFile('etc/i2pd/tunnels.conf', generateTunnelsConf(defaultConfig))
    }
  }
})
