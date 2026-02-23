import { hsDir, nextKey, torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value, Variants } = sdk

const privateKeySpec = InputSpec.of({
  privateKey: Value.text({
    name: i18n('Private Key (optional)'),
    description: i18n(
      'Base64-encoded ed25519 private key for a vanity .onion address. Leave blank to auto-generate.',
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
    minLength: 128,
    maxLength: 128,
  }),
})

const inputSpec = InputSpec.of({
  urlPluginMetadata: Value.hidden<{
    packageId: string
    interfaceId: string
    hostId: string
    internalPort: number
  }>(),
  alsoSsl: Value.toggle({
    name: i18n('Also SSL'),
    description: i18n('Also serve this address with SSL'),
    default: false,
  }),
}).add(({ Value }) => ({
  address: Value.dynamicUnion(async ({ prefill }) => {
    const { packageId, hostId, internalPort } = prefill?.urlPluginMetadata ?? {}

    const config = await torrc.read().once()
    const entries =
      (packageId && hostId && config?.onionServices?.[packageId]?.[hostId]) ||
      {}

    // Determine the non-SSL target for this binding so we can check if it's already served
    let nonSslTarget: string | undefined
    if (packageId && internalPort != null) {
      const defaultHost =
        packageId === 'STARTOS' ? 'startos' : `${packageId}.startos`
      nonSslTarget = `${defaultHost}:${internalPort}`
    }

    const variants: Record<
      string,
      {
        name: string
        spec: typeof privateKeySpec | ReturnType<typeof InputSpec.of>
      }
    > = {}

    for (const [key, entry] of Object.entries(entries)) {
      // Skip if this entry already serves this binding (non-SSL)
      if (
        nonSslTarget &&
        Object.values(entry.ports).every(
          (p) => p.ssl || p.target !== nonSslTarget,
        )
      )
        continue

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
  inputSpec,

  // pre-fill (none needed - system provides urlPluginMetadata)
  async () => null,

  // execution
  async ({ effects, input }) => {
    const { packageId, hostId, internalPort } = input.urlPluginMetadata
    const address = input.address as {
      selection: string
      value: { privateKey?: string | null }
    }

    const defaultHost =
      packageId === 'STARTOS' ? 'startos' : `${packageId}.startos`

    // Look up the binding for this internalPort
    const hosts = await sdk.serviceInterface
      .getAll(effects, { packageId }, (ifaces) =>
        ifaces
          .filter((i) => i.addressInfo?.hostId === hostId && i.host)
          .map((i) => i.host!),
      )
      .once()

    const host = hosts[0]
    const binding = host?.bindings[internalPort]

    // Build port entries: Record<externalPort, { target, ssl, internalPort }>
    const newPorts: Record<
      string,
      { target: string; ssl: boolean; internalPort: number }
    > = {}

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

    // Add SSL port if requested
    if (input.alsoSsl && binding?.options.addSsl) {
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
    }

    const config = await torrc.read().once()
    const onionServices = structuredClone(config?.onionServices || {})
    if (!onionServices[packageId]) onionServices[packageId] = {}
    if (!onionServices[packageId][hostId]) onionServices[packageId][hostId] = {}

    const services = onionServices[packageId][hostId]

    if (address.selection !== 'new') {
      // Reuse existing address by key
      const existing = services[address.selection]
      if (existing) {
        services[address.selection] = {
          ports: { ...existing.ports, ...newPorts },
        }
      }
    } else {
      // Create new entry
      const key = nextKey(services)
      services[key] = { ports: newPorts }

      // Write private key if provided
      if (address.value.privateKey) {
        await sdk.volumes.tor.writeFile(
          `${hsDir(packageId, hostId, key)}/hs_ed25519_secret_key`,
          Buffer.from(address.value.privateKey, 'base64'),
        )
      }
    }

    await torrc.write(effects, {
      ...config,
      relay: config?.relay ?? { enabled: false },
      onionServices,
    })
  },
)
