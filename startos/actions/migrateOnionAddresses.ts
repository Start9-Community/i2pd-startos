import { FileHelper, z } from '@start9labs/start-sdk'
import { hsDir, nextKey, torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { rename } from 'fs/promises'

const { InputSpec, Value } = sdk

const migrationEntryShape = z.object({
  packageId: z.string(),
  hostId: z.string(),
  hostname: z.string(),
  key: z.string(),
})

const migrationShape = z.object({ addresses: z.array(migrationEntryShape) })

const migrationFile = FileHelper.json(
  { base: sdk.volumes.startos, subpath: 'onion-migration.json' },
  migrationShape,
)

const inputSpec = InputSpec.of({
  addresses: Value.dynamicMultiselect(async ({ effects }) => {
    const entries = (await migrationFile.read().once())?.addresses ?? []

    const values: Record<string, string> = {}

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      let serviceTitle = entry.packageId
      let interfaceName = entry.hostId

      if (entry.packageId === 'STARTOS') {
        serviceTitle = 'StartOS'
        interfaceName = 'Web UI'
      } else {
        try {
          const manifest = await sdk
            .getServiceManifest(effects, entry.packageId)
            .once()
          if (manifest?.title) serviceTitle = manifest.title
        } catch {
          // service not installed
        }

        try {
          const ifaces = await sdk.serviceInterface
            .getAll(effects, {
              packageId: entry.packageId,
            })
            .once()
          const names = ifaces
            .filter((a) => a.addressInfo?.hostId === entry.hostId)
            .map((i) => i.name)
          if (names.length) interfaceName = names.join(', ')
        } catch {
          // service not installed
        }
      }

      values[String(i)] =
        `${serviceTitle} - ${interfaceName} (${entry.hostname.slice(0, 5)}..${entry.hostname.slice(-10)})`
    }

    return {
      name: i18n('Addresses'),
      description: i18n('Select which .onion addresses to import'),
      default: [],
      values,
    }
  }),
})

type IS = typeof inputSpec._TYPE

export const migrateOnionAddresses = sdk.Action.withInput(
  // id
  'migrate-onion-addresses',

  // metadata
  async ({ effects }) => {
    const entries = (await migrationFile.read().const(effects))?.addresses ?? []
    const hasEntries = entries !== null && entries.length > 0

    return {
      name: i18n('Import Onion Addresses'),
      description: i18n('Import .onion addresses from a previous installation'),
      warning: null,
      allowedStatuses: 'any',
      group: null,
      visibility: hasEntries ? 'enabled' : 'hidden',
    }
  },

  // input spec
  inputSpec,

  // pre-fill: no addresses selected by default
  async ({ effects }) => {
    return {
      addresses: [],
    }
  },

  // execution
  async ({ effects, input }) => {
    const entries = (await migrationFile.read().once())?.addresses ?? []
    const selectedIndices = new Set(input.addresses.map(Number))

    const config = await torrc.read().once()
    const onionServices = structuredClone(config?.onionServices || {})

    for (let i = 0; i < entries.length; i++) {
      if (!selectedIndices.has(i)) continue

      const entry = entries[i]
      const { packageId, hostId, key } = entry

      const defaultHost =
        packageId === 'STARTOS' ? 'startos' : `${packageId}.startos`

      let ports: Record<
        string,
        { target: string; ssl: boolean; internalPort: number }
      >

      if (packageId === 'STARTOS') {
        ports = {
          '80': {
            target: `${defaultHost}:80`,
            ssl: false,
            internalPort: 80,
          },
        }
      } else {
        const hosts = await sdk.serviceInterface
          .getAll(effects, { packageId }, (ifaces) =>
            ifaces
              .filter((i) => i.addressInfo?.hostId === hostId && i.host)
              .map((i) => i.host!),
          )
          .once()

        const host = hosts[0]
        if (!host) continue // package not installed, skip

        ports = {}
        for (const [internalPort, b] of Object.entries(host.bindings)) {
          if (b.enabled) {
            ports[String(b.options.preferredExternalPort)] = {
              target: `${defaultHost}:${internalPort}`,
              ssl: false,
              internalPort: Number(internalPort),
            }
          }
        }
      }

      if (!onionServices[packageId]) onionServices[packageId] = {}
      if (!onionServices[packageId][hostId])
        onionServices[packageId][hostId] = {}

      const entryKey = nextKey(onionServices[packageId][hostId])
      onionServices[packageId][hostId][entryKey] = { ports }

      const header = Buffer.from('== ed25519v1-secret: type0 ==\x00\x00\x00')
      const keyBytes = Buffer.from(key, 'base64')
      await sdk.volumes.tor.writeFile(
        `${hsDir(packageId, hostId, entryKey)}/hs_ed25519_secret_key`,
        Buffer.concat([header, keyBytes]),
      )
    }

    await torrc.write(effects, {
      ...config,
      relay: config?.relay ?? { enabled: false },
      onionServices,
    })
    await rename(
      migrationFile.path,
      sdk.volumes.startos.subpath('.onion-migration.json.bak'),
    )
  },
)
