import { rename } from 'node:fs/promises'
import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { hsDir, nextKey, torrc } from '../fileModels/torrc'
import { generateOnionFiles, isClamped } from '../utils'

const migrationEntryShape = z.object({
  packageId: z.string(),
  hostId: z.string(),
  hostname: z.string(),
  key: z.string(),
})

const migrationFile = FileHelper.json(
  { base: sdk.volumes.startos, subpath: 'onion-migration.json' },
  z.object({ addresses: z.array(migrationEntryShape) }),
)

export const migrateOnionAddresses = sdk.setupOnInit(async (effects) => {
  const migration = await migrationFile.read().once()
  if (!migration?.addresses?.length) return

  console.info(
    `Found ${migration.addresses.length} onion address(es) to import`,
  )

  const config = await torrc.read().once()
  const onionServices = structuredClone(config?.onionServices || {})

  for (const entry of migration.addresses) {
    let { packageId, hostId, key } = entry

    // Skip keys that aren't properly clamped
    if (!key) continue
    const keyBytes = Buffer.from(key, 'base64')
    if (keyBytes.length < 64 || !isClamped(keyBytes.subarray(0, 32))) continue

    const defaultHost =
      packageId === 'STARTOS' ? 'startos' : `${packageId}.startos`

    let ports: Record<
      string,
      { target: string; ssl: boolean; internalPort: number }
    >

    if (packageId === 'STARTOS') {
      hostId = 'startos-ui'
      ports = {
        '80': {
          target: `${defaultHost}:80`,
          ssl: false,
          internalPort: 80,
        },
        '443': {
          target: `${defaultHost}:443`,
          ssl: true,
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
    if (!onionServices[packageId][hostId]) onionServices[packageId][hostId] = {}

    const entryKey = nextKey(onionServices[packageId][hostId])
    onionServices[packageId][hostId][entryKey] = { ports }

    const dir = hsDir(packageId, hostId, entryKey)
    const { secretKey, hostname } = generateOnionFiles(key)
    await sdk.volumes.tor.writeFile(`${dir}/hs_ed25519_secret_key`, secretKey)
    await sdk.volumes.tor.writeFile(`${dir}/hostname`, hostname + '\n')
    console.info(`Imported onion address for ${packageId}/${hostId}`)
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
  console.info('Onion address migration complete')
})
