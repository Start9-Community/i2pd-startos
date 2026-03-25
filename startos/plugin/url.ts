import { FileHelper } from '@start9labs/start-sdk'
import { rm } from 'fs/promises'
import { addI2pTunnel } from '../actions/addI2pTunnel'
import { deleteI2pTunnel } from '../actions/deleteI2pTunnel'
import { tunnelDir, i2pdConfig } from '../fileModels/i2pd'
import { sdk } from '../sdk'

export const registerUrlPlugin = sdk.setupOnInit(async (effects) =>
  sdk.plugin.url.register(effects, { tableAction: addI2pTunnel }),
)

export const exportUrls = sdk.plugin.url.setupExportedUrls(
  async ({ effects }) => {
    const i2pServices =
      (await i2pdConfig.read((t) => t.i2pServices).const(effects)) || {}

    // Phase 1: Remove I2P tunnel entries whose target interface no longer exists
    const cleaned = structuredClone(i2pServices)
    const removed: string[] = []

    for (const [packageId, hosts] of Object.entries(cleaned)) {
      if (packageId === 'STARTOS') continue

      const hostIds = await sdk.serviceInterface
        .getAll(effects, { packageId }, (ifaces) =>
          new Set(ifaces.map((i) => i.addressInfo?.hostId).filter(Boolean)),
        )
        .const()

      for (const [hostId, services] of Object.entries(hosts)) {
        if (!hostIds.has(hostId)) {
          for (const index of Object.keys(services)) {
            await rm(sdk.volumes.i2pd.subpath(tunnelDir(packageId, hostId, index)), {
              recursive: true,
              force: true,
            })
          }
          // Set to undefined (not delete) so merge() removes the key from the file
          ;(cleaned[packageId] as any)[hostId] = undefined
          removed.push(`${packageId}/${hostId}`)
        }
      }

      if (
        Object.values(cleaned[packageId] || {}).every((v) => v === undefined)
      ) {
        ;(cleaned as any)[packageId] = undefined
      }
    }

    if (removed.length) {
      // Writing the cleaned config triggers the .const() watcher, which
      // re-invokes this function. On the second run removed is empty,
      // so Phase 2 exports the URLs. This is why we return early here.
      console.info(
        `Removed stale I2P tunnel entries: ${removed.join(', ')}`,
      )
      await i2pdConfig.merge(
        effects,
        { i2pServices: cleaned },
        { allowWriteAfterConst: true },
      )
      return
    }

    // Phase 2: Export URLs for all valid entries
    for (const [packageId, hosts] of Object.entries(i2pServices)) {
      for (const [hostId, services] of Object.entries(hosts)) {
        for (const [i, svc] of Object.entries(services)) {
          const hostnameFile = FileHelper.string({
            base: sdk.volumes.i2pd,
            subpath: `${tunnelDir(packageId, hostId, i)}/hostname`,
          })
          const hostname = await hostnameFile.read().const(effects)
          if (!hostname) continue

          for (const [externalPort, portInfo] of Object.entries(svc.ports)) {
            await sdk.plugin.url
              .exportUrl(effects, {
                hostnameInfo: {
                  packageId: packageId === 'STARTOS' ? null : packageId,
                  hostId,
                  internalPort: portInfo.internalPort,
                  ssl: portInfo.ssl,
                  public: true,
                  hostname: hostname.trim(),
                  port: parseInt(externalPort, 10),
                  info: null,
                },
                removeAction: deleteI2pTunnel,
                overflowActions: [],
              })
              .catch((e) => {
                console.error('Failed to export url', e)
              })
          }
        }
      }
    }
  },
)
