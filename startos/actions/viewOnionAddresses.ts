import { hsDir, torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const viewOnionAddresses = sdk.Action.withoutInput(
  // id
  'view-onion-addresses',

  // metadata
  async ({ effects }) => {
    const store = await torrc.read().const(effects)
    const onionServices = store?.onionServices || {}
    const hasServices = Object.values(onionServices).some((hosts) =>
      Object.values(hosts).some(
        (services) => Object.keys(services).length > 0,
      ),
    )

    return {
      name: i18n('View Onion Addresses'),
      description: i18n('View the .onion addresses for your services'),
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: hasServices
        ? 'enabled'
        : { disabled: i18n('You have no onion services') },
    }
  },

  // execution function
  async ({ effects }) => {
    const store = await torrc.read().once()
    const onionServices = store?.onionServices || {}

    const entries = await Promise.all(
      Object.entries(onionServices).flatMap(([packageId, hosts]) =>
        Object.entries(hosts).flatMap(([hostId, services]) =>
          Object.entries(services).map(async ([key, svc]) => {
            let hostname = '<pending>'
            try {
              const content = await sdk.volumes.tor.readFile(
                `${hsDir(packageId, hostId, key)}/hostname`,
              )
              hostname = content.toString().trim()
            } catch {
              // hostname file doesn't exist yet (first run)
            }

            let displayName: string

            if (packageId !== 'STARTOS') {
              const title = await sdk
                .getServiceManifest(effects, packageId, (m) => m?.title)
                .const()

              const ifaceNames = await sdk.serviceInterface
                .getAll(effects, { packageId }, (ifaces) =>
                  ifaces
                    .filter((i) => i.addressInfo?.hostId === hostId)
                    .map((i) => i.name),
                )
                .once()

              displayName = `${title} (${ifaceNames.join(', ')})`
            } else {
              displayName = 'StartOS (UI)'
            }

            return Object.entries(svc.ports).map(
              ([externalPort, _portInfo]) => ({
                type: 'single' as const,
                name: displayName,
                description: null,
                value:
                  externalPort === '80'
                    ? `http://${hostname}`
                    : `http://${hostname}:${externalPort}`,
                masked: false,
                copyable: true,
                qr: true,
              }),
            )
          }),
        ),
      ),
    )

    return {
      version: '1' as const,
      title: i18n('Onion Addresses'),
      message: null,
      result: {
        type: 'group' as const,
        value: entries.flat(),
      },
    }
  },
)
