import { FileHelper } from '@start9labs/start-sdk'
import { rm } from 'fs/promises'
import { addI2pTunnel } from '../actions/addI2pTunnel'
import { deleteI2pTunnel } from '../actions/deleteI2pTunnel'
import {
  tunnelDir,
  i2pdConfig,
  generateI2pdConf,
  generateTunnelsConf,
} from '../fileModels/i2pd'
import { reloadI2pdTunnels } from '../utils'
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
      if (packageId === 'STARTOS' || !hosts) continue

      const hostIds = await sdk.serviceInterface
        .getAll(
          effects,
          { packageId },
          (ifaces) =>
            new Set(ifaces.map((i) => i.addressInfo?.hostId).filter(Boolean)),
        )
        .const()

      for (const [hostId, services] of Object.entries(hosts)) {
        if (!hostIds.has(hostId)) {
          for (const index of Object.keys(services ?? {})) {
            await rm(
              sdk.volumes.i2pd.subpath(tunnelDir(packageId, hostId, index)),
              {
                recursive: true,
                force: true,
              },
            )
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

    // Persist the cleaned config if we dropped any stale entries. We must NOT
    // return early here: setupExportedUrls calls clearUrls({ except }) with the
    // URLs exported during this run, so returning before Phase 2 would leave
    // `except` empty and transiently wipe every package's I2P address from
    // every host — firing host-info watchers and restarting every service that
    // watches its own address. Instead we fall through and export the
    // survivors in the same pass, so clearUrls only prunes the genuinely-stale
    // entries.
    if (removed.length) {
      console.info(`Removed stale I2P tunnel entries: ${removed.join(', ')}`)
      await i2pdConfig.merge(
        effects,
        { i2pServices: cleaned },
        { allowWriteAfterConst: true },
      )
      // Unlike Tor (where the file model IS the daemon's config file), i2pd
      // reads generated conf files — re-emit them from the merged config and
      // hot-reload the running router so it actually drops the stale tunnels.
      const updated = await i2pdConfig.read().once()
      if (updated) {
        await sdk.volumes.i2pd.writeFile(
          'etc/i2pd/i2pd.conf',
          generateI2pdConf(updated),
        )
        await sdk.volumes.i2pd.writeFile(
          'etc/i2pd/tunnels.conf',
          generateTunnelsConf(updated),
        )
        await reloadI2pdTunnels(effects)
      }
    }

    // Phase 2: Export URLs for all surviving entries
    for (const [packageId, hosts] of Object.entries(cleaned)) {
      if (!hosts) continue
      for (const [hostId, services] of Object.entries(hosts)) {
        for (const [i, svc] of Object.entries(services ?? {})) {
          const hostnameFile = FileHelper.string({
            base: sdk.volumes.i2pd,
            subpath: `${tunnelDir(packageId, hostId, i)}/hostname`,
          })
          const hostname = await hostnameFile.read().const(effects)
          if (!hostname) continue

          for (const [externalPort, portInfo] of Object.entries(
            svc?.ports ?? {},
          )) {
            if (!portInfo) continue
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
