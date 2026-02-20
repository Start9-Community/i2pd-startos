import { FileHelper, matches } from '@start9labs/start-sdk'
import { hsDir, torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { rename } from 'fs/promises'

const { InputSpec, Value, List } = sdk

const { arrayOf, object, string } = matches

const migrationEntryShape = object({
  packageId: string,
  hostId: string,
  hostname: string,
  key: string,
})

const migrationShape = arrayOf(migrationEntryShape)

const migrationFile = FileHelper.json(
  { base: sdk.volumes.start9, subpath: 'onion-migration.json' },
  migrationShape,
)

const inputSpec = InputSpec.of({
  addresses: Value.list(
    List.obj(
      { name: i18n('Addresses') },
      {
        displayAs: '{{hostname}}',
        spec: InputSpec.of({
          hostname: Value.text({
            name: i18n('Onion Address'),
            required: true,
            default: null,
            placeholder: null,
            patterns: [],
            masked: false,
            inputmode: 'text',
            minLength: null,
            maxLength: null,
            description: null,
          }),
          packageId: Value.hidden<string>(),
          hostId: Value.hidden<string>(),
          key: Value.hidden<string>(),
        }),
      },
    ),
  ),
})

type IS = typeof inputSpec._TYPE

export const migrateOnionAddresses = sdk.Action.withInput(
  // id
  'migrate-onion-addresses',

  // metadata
  async ({ effects }) => {
    const entries = await migrationFile.read().const(effects)
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

  // pre-fill
  async ({ effects }) => {
    const entries = await migrationFile.read().once()
    if (!entries) return { addresses: [] }

    return {
      addresses: entries.map((e) => ({
        hostname: e.hostname,
        packageId: e.packageId,
        hostId: e.hostId,
        key: e.key,
      })),
    }
  },

  // execution
  async ({ effects, input }) => {
    const config = await torrc.read().once()
    const onionServices = structuredClone(config?.onionServices || {})

    for (const entry of input.addresses) {
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
        onionServices[packageId][hostId] = []

      const index = onionServices[packageId][hostId].length
      onionServices[packageId][hostId].push({ ports })

      await sdk.volumes.tor.writeFile(
        `${hsDir(packageId, hostId, index)}/hs_ed25519_secret_key`,
        Buffer.from(key, 'base64'),
      )
    }

    await torrc.write(effects, { ...config, onionServices })
    await rename(
      migrationFile.path,
      sdk.volumes.start9.subpath('.onion-migration.json.bak'),
    )
  },
)
