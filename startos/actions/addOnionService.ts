import { hsDir, nextKey, torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { generateOnionFiles } from '../utils'

const { InputSpec, Value, Variants } = sdk

const privateKeySpec = InputSpec.of({
  privateKey: Value.text({
    name: i18n('Private Key (optional)'),
    description: i18n(
      'Base64-encoded ed25519 expanded private key for a vanity .onion address. Leave blank to auto-generate.',
    ),
    required: false,
    default: null,
    placeholder: null,
    patterns: [
      {
        regex: '^[A-Za-z0-9+/]+=*$',
        description: 'Must be a valid base64 string',
      },
    ],
    masked: true,
    inputmode: 'text',
    minLength: 88,
    maxLength: 88,
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

    const config = await torrc.read().once()
    const entries =
      (packageId && hostId && config?.onionServices?.[packageId]?.[hostId]) ||
      {}

    const variants: Record<
      string,
      {
        name: string
        spec: typeof privateKeySpec | ReturnType<typeof InputSpec.of>
      }
    > = {}

    for (const [key, entry] of Object.entries(entries)) {
      if (internalPort == null) continue

      // Show address only if it partially serves this binding (has one of SSL/non-SSL but not both)
      const bindingPorts = Object.values(entry.ports).filter(
        (p) => p.internalPort === internalPort,
      )
      const hasNonSsl = bindingPorts.some((p) => !p.ssl)
      const hasSsl = bindingPorts.some((p) => p.ssl)
      if (hasNonSsl === hasSsl) continue // skip if has both or neither

      let hostname = key
      try {
        const content = await sdk.volumes.tor.readFile(
          `${hsDir(packageId!, hostId!, key)}/hostname`,
        )
        hostname = content.toString().trim()
      } catch {
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

export const addOnionService = sdk.Action.withInput(
  // id
  'add-onion-service',

  // metadata
  async () => ({
    name: i18n('Add Onion Service'),
    description: i18n('Add a Tor onion service for this URL'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'hidden',
  }),

  // input spec
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

  // pre-fill (none needed - system provides urlPluginMetadata)
  async () => null,

  // execution
  async ({ effects, input }) => {
    const { packageId, hostId, interfaceId, internalPort } =
      input.urlPluginMetadata
    const address = input.address as {
      selection: string
      value: { privateKey?: string | null }
    }

    const defaultHost =
      packageId === 'STARTOS' ? 'startos' : `${packageId}.startos`

    // Look up the binding for this internalPort
    const iface = await sdk.serviceInterface
      .get(effects, { packageId, id: interfaceId })
      .once()

    const host = iface?.host
    const binding = host?.bindings[internalPort]

    // Build port entry: either SSL or non-SSL based on toggle
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
      if (packageId === 'STARTOS') {
        newPorts['80'] = {
          target: `${defaultHost}:80`,
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

    const config = await torrc.read().once()
    const onionServices = config?.onionServices || {}
    if (!onionServices[packageId]) onionServices[packageId] = {}
    if (!onionServices[packageId][hostId]) onionServices[packageId][hostId] = {}

    const services = onionServices[packageId][hostId]

    if (address.selection !== 'new') {
      // Reuse existing address by key
      const existing = services[address.selection]
      if (existing) {
        const duplicate = Object.values(existing.ports).some(
          (p) => p.ssl === !!input.ssl && p.internalPort === internalPort,
        )
        if (duplicate) {
          throw new Error(
            input.ssl
              ? i18n(
                  'This onion address already has an SSL binding for this port',
                )
              : i18n(
                  'This onion address already has a non-SSL binding for this port',
                ),
          )
        }
        services[address.selection] = {
          ports: { ...existing.ports, ...newPorts },
        }
      }
    } else {
      // Create new entry
      const key = nextKey(services)
      services[key] = { ports: newPorts }

      const dir = hsDir(packageId, hostId, key)
      const { secretKey, hostname } = generateOnionFiles(
        address.value.privateKey,
      )
      await sdk.volumes.tor.writeFile(`${dir}/hs_ed25519_secret_key`, secretKey)
      await sdk.volumes.tor.writeFile(`${dir}/hostname`, hostname + '\n')
    }

    await torrc.write(effects, {
      ...config,
      relay: config?.relay ?? { enabled: false },
      onionServices,
    })
  },
)
