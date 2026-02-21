import { FileHelper } from '@start9labs/start-sdk'
import { addOnionService } from '../actions/addOnionService'
import { deleteOnionService } from '../actions/deleteOnionService'
import { hsDir, torrc } from '../fileModels/torrc'
import { sdk } from '../sdk'

export const registerUrlPlugin = sdk.setupOnInit(async (effects) =>
  sdk.plugin.url.register(effects, { tableAction: addOnionService }),
)

export const exportUrls = sdk.plugin.url.setupExportedUrls(
  async ({ effects }) => {
    const onionServices = await torrc
      .read((a) => a.onionServices)
      .const(effects)
    if (!onionServices) return

    for (const [packageId, hosts] of Object.entries(onionServices)) {
      for (const [hostId, services] of Object.entries(hosts)) {
        for (let i = 0; i < services.length; i++) {
          const svc = services[i]
          const hostnameFile = FileHelper.string({
            base: sdk.volumes.tor,
            subpath: `${hsDir(packageId, hostId, i)}/hostname`,
          })
          const hostname = await hostnameFile.read().const(effects)
          if (!hostname) continue

          for (const [externalPort, portInfo] of Object.entries(svc.ports)) {
            await sdk.plugin.url.exportUrl(effects, {
              hostnameInfo: {
                packageId: packageId === 'STARTOS' ? null : packageId,
                hostId,
                internalPort: portInfo.internalPort,
                ssl: portInfo.ssl,
                public: false,
                hostname: hostname.trim(),
                port: parseInt(externalPort, 10),
                info: null,
              },
              removeAction: deleteOnionService,
              overflowActions: [],
            })
          }
        }
      }
    }
  },
)
