import { i2pdConfig, tunnelDir, syncConfigToFiles } from '../fileModels/i2pd'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  urlPluginMetadata: Value.hidden<{
    interfaceId: string
    packageId: string | null
    hostId: string
    internalPort: number
    ssl: boolean
    public: boolean
    hostname: string
    port: number | null
    info: unknown
  }>(),
})

export const deleteI2pTunnel = sdk.Action.withInput(
  'delete-i2p-tunnel',

  async () => ({
    name: i18n('Delete I2P Tunnel'),
    description: i18n('Remove an I2P tunnel'),
    warning: i18n('Confirm you would like to delete this .b32.i2p address'),
    allowedStatuses: 'any',
    group: null,
    visibility: 'hidden',
  }),

  inputSpec,

  async () => null,

  async ({ effects, input }) => {
    const { packageId, hostId, hostname, port, ssl } = input.urlPluginMetadata
    if (!packageId) return

    const config = await i2pdConfig.read().once()
    const i2pServices = structuredClone(config?.i2pServices || {})
    const services = i2pServices[packageId]?.[hostId]
    if (!services) return

    for (const [key, svc] of Object.entries(services)) {
      let tunnelHostname: string | undefined
      try {
        const content = await sdk.volumes.i2pd.readFile(
          `${tunnelDir(packageId, hostId, key)}/hostname`,
        )
        tunnelHostname = content.toString().trim()
      } catch (e: any) {
        if (e?.code !== 'ENOENT') throw e
        continue
      }

      if (tunnelHostname !== hostname) continue

      // Found the matching entry — remove the specific port
      const portKey = port !== null ? String(port) : null
      if (portKey && svc.ports[portKey]) {
        const portInfo = svc.ports[portKey]!
        if (portInfo.ssl === ssl) {
          delete svc.ports[portKey]
        }
      }

      // If no ports remain, remove the entire entry and clean up files
      if (Object.keys(svc.ports).length === 0) {
        delete services[key]
        // SDK doesn't have a delete method, so we can't clean up .dat key files.
        // The orphaned key is harmless but wastes ~679 bytes on disk per deleted tunnel.
      }
      break
    }

    // Clean up empty host/package entries
    if (Object.keys(services).length === 0) {
      delete i2pServices[packageId][hostId]
    }
    if (Object.keys(i2pServices[packageId] || {}).length === 0) {
      delete i2pServices[packageId]
    }

    const updatedConfig = {
      i2pServices,
      floodfill: config?.floodfill ?? { enabled: false },
      router: config?.router ?? { bandwidth: 'O' as const, transit: true, loglevel: 'warn' as const },
    }
    await i2pdConfig.write(effects, updatedConfig)
    await syncConfigToFiles(updatedConfig)

    // Note: i2pd should reload config automatically when the file changes
    // The SDK doesn't expose a daemon signal method, so SIGHUP reload isn't available
  },
)
