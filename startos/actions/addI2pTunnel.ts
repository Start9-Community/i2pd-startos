import { i2pdConfig, nextKey, tunnelDir, generateI2pdConf, generateTunnelsConf } from '../fileModels/i2pd'
import { sdk } from '../sdk'
import { i18n } from '../i18n'
import { parseI2pKey, reloadI2pdTunnels } from '../utils'

const { InputSpec, Value, Variants } = sdk

const privateKeySpec = InputSpec.of({
  privateKey: Value.text({
    name: i18n('Private Key (.dat file, base64), optional'),
    description: i18n(
      'Paste the base64-encoded contents of an existing i2pd .dat key file to reuse a known .b32.i2p address. Leave blank to auto-generate a new address. Only EdDSA-SHA512-ED25519 + ElGamal keys (679 bytes) are supported.',
    ),
    required: false,
    default: null,
    placeholder: null,
    patterns: [
      {
        regex: '^[A-Za-z0-9+/\\s]+=*$',
        description: i18n('Must be a valid base64 string'),
      },
    ],
    masked: true,
    inputmode: 'text',
    minLength: 908,
    maxLength: 916,
  }),
})

const inputSpec = InputSpec.of({
  urlPluginMetadata: Value.hidden<{
    packageId: string
    interfaceId: string
    hostId: string
    internalPort: number
  }>(),
  ssl: Value.toggle({
    name: i18n('SSL'),
    description: i18n('Serve this address with SSL'),
    default: false,
  }),
}).add(({ Value }) => ({
  address: Value.dynamicUnion(async ({ prefill }) => {
    const { packageId, hostId, internalPort } = prefill?.urlPluginMetadata ?? {}

    const config = await i2pdConfig.read().once()
    const entries =
      (packageId && hostId && config?.i2pServices?.[packageId]?.[hostId]) ||
      {}

    const variants: Record<
      string,
      {
        name: string
        spec: ReturnType<typeof InputSpec.of>
      }
    > = {}

    for (const [key, entry] of Object.entries(entries)) {
      if (internalPort == null) continue

      const bindingPorts = Object.values(entry.ports).filter(
        (p) => p.internalPort === internalPort,
      )
      const hasNonSsl = bindingPorts.some((p) => !p.ssl)
      const hasSsl = bindingPorts.some((p) => p.ssl)
      if (hasNonSsl === hasSsl) continue

      let hostname = key
      try {
        const content = await sdk.volumes.i2pd.readFile(
          `${tunnelDir(packageId!, hostId!, key)}/hostname`,
        )
        hostname = content.toString().trim()
      } catch (e: any) {
        if (e?.code !== 'ENOENT') throw e
        // hostname file doesn't exist yet
      }
      variants[key] = {
        name: hostname,
        spec: InputSpec.of({}),
      }
    }

    variants['new'] = {
      name: i18n('Create new address'),
      spec: privateKeySpec,
    }

    return {
      name: i18n('Address'),
      default: 'new',
      disabled: false,
      variants: Variants.of(variants),
    }
  }),
}))

export const addI2pTunnel = sdk.Action.withInput(
  'add-i2p-tunnel',

  async () => ({
    name: i18n('Add I2P Tunnel'),
    description: i18n('Add an I2P tunnel for this URL'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'hidden',
  }),

  async ({ effects, prefill }) => {
    const p = prefill as typeof inputSpec._PARTIAL
    let noSsl = false

    if (p?.urlPluginMetadata?.packageId && p.urlPluginMetadata.interfaceId) {
      const iface = await sdk.serviceInterface
        .get(effects, {
          packageId: p?.urlPluginMetadata?.packageId,
          id: p.urlPluginMetadata.interfaceId,
        })
        .once()
      if (iface?.addressInfo?.internalPort) {
        noSsl =
          !iface?.host?.bindings[iface.addressInfo?.internalPort].options.addSsl
      }
    }

    return inputSpec.filter(
      {
        ssl: !noSsl,
      },
      true,
    )
  },

  async () => null,

  async ({ effects, input }) => {
    if (!input.urlPluginMetadata) {
      throw new Error(
        'This action must be invoked through the URL plugin',
      )
    }
    const { packageId, hostId, interfaceId, internalPort } =
      input.urlPluginMetadata
    const address = input.address as {
      selection: string
      value: unknown
    }

    // I2P's own proxy interfaces (SOCKS 4447, HTTP 4444) are outbound-only
    // assigning an inbound .b32.i2p tunnel to these is nonsensical.
    if (packageId === 'i2p') {
      throw new Error(
        i18n('I2P proxy interfaces cannot receive I2P tunnel addresses'),
      )
    }

    // null packageId means the StartOS system UI interface (no backing package)
    const pkgKey: string = packageId ?? 'STARTOS'
    const defaultHost = packageId ? `${packageId}.startos` : 'startos'

    const iface =
      packageId && interfaceId
        ? await sdk.serviceInterface
            .get(effects, { packageId, id: interfaceId })
            .once()
        : null

    const host = iface?.host
    const binding = host?.bindings[internalPort]

    const newPorts: Record<
      string,
      { target: string; ssl: boolean; internalPort: number }
    > = {}

    if (input.ssl && binding?.options.addSsl) {
      const sslAddr = binding.addresses.available.find(
        (a) =>
          a.ssl &&
          a.metadata.kind === 'ipv4' &&
          a.metadata.gateway === 'lxcbr0',
      )
      if (sslAddr && sslAddr.port !== null) {
        newPorts[String(binding.options.addSsl.preferredExternalPort)] = {
          target: `${sslAddr.hostname}:${sslAddr.port}`,
          ssl: true,
          internalPort,
        }
      }
    } else {
      if (!packageId || packageId === 'STARTOS') {
        newPorts['80'] = {
          target: `startos:80`,
          ssl: false,
          internalPort: 80,
        }
      } else if (binding?.enabled) {
        newPorts[String(binding.options.preferredExternalPort)] = {
          target: `${defaultHost}:${internalPort}`,
          ssl: false,
          internalPort,
        }
      } else {
        newPorts[String(internalPort)] = {
          target: `${defaultHost}:${internalPort}`,
          ssl: false,
          internalPort,
        }
      }
    }

    // Load current config
    const config = await i2pdConfig.read().once()
    const i2pServices = structuredClone(config?.i2pServices || {})
    if (!i2pServices[pkgKey]) i2pServices[pkgKey] = {}
    if (!i2pServices[pkgKey][hostId])
      i2pServices[pkgKey][hostId] = {}

    const services = i2pServices[pkgKey][hostId]
    let index: string

    if (address.selection === 'new') {
      index = nextKey(services)
      const tunnelPath = tunnelDir(pkgKey, hostId, index)
      const keyfileName = `${pkgKey}-${hostId}-${index}.dat`

      // Generate a new key pair or import an existing one (if privateKey provided).
      // parseI2pKey(null) falls back to generateI2pKey().
      const privateKey =
        (address.value as { privateKey?: string | null } | null)?.privateKey ??
        null
      const { keyfile, hostname } = parseI2pKey(privateKey)
      await sdk.volumes.i2pd.writeFile(`${tunnelPath}/${keyfileName}`, keyfile)
      await sdk.volumes.i2pd.writeFile(`${tunnelPath}/hostname`, hostname)

      services[index] = { ports: newPorts }
    } else {
      // Reuse existing address
      index = address.selection
      if (!services[index]) services[index] = { ports: {} }
      services[index]!.ports = { ...services[index]!.ports, ...newPorts }
    }

    // Build and write the full config in one pass, avoids a second read() call
    // after write() which can race and throw "Unexpected end of JSON input".
    const updatedConfig = {
      i2pServices,
      floodfill: config?.floodfill ?? { enabled: false },
      router: config?.router ?? { bandwidth: 'O' as const, transit: true, loglevel: 'warn' as const },
    }
    await i2pdConfig.write(effects, updatedConfig)
    await sdk.volumes.i2pd.writeFile('etc/i2pd/i2pd.conf', generateI2pdConf(updatedConfig))
    await sdk.volumes.i2pd.writeFile('etc/i2pd/tunnels.conf', generateTunnelsConf(updatedConfig))
    await reloadI2pdTunnels()
    return null
  },
)
