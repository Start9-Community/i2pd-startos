import { torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const viewOnionAddresses = sdk.Action.withoutInput(
  // id
  'view-onion-addresses',

  // metadata
  async ({ effects }) => {
    const store = await torrc.read().const(effects)
    const onionServices = store?.onionServices || {}

    return {
      name: i18n('View Onion Addresses'),
      description: i18n('View the .onion addresses for your services'),
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: Object.keys(onionServices).length
        ? 'enabled'
        : { disabled: i18n('You have no onion services') },
    }
  },

  // execution function
  async ({ effects }) => {
    const store = await torrc.read().once()
    const onionServices = store?.onionServices || {}

    const entries = await Promise.all(
      Object.entries(onionServices).map(async ([key, svc]) => {
        let hostname = '<pending>'
        try {
          const content = await sdk.volumes.tor.readFile(`hs_${key}/hostname`)
          hostname = content.toString().trim()
        } catch {
          // hostname file doesn't exist yet (first run)
        }

        let displayName: string

        if (svc.packageId !== 'startos') {
          const title = await sdk
            .getServiceManifest(effects, svc.packageId, (m) => m?.title)
            .const()

          const ifaceNames = await sdk.serviceInterface
            .getAll(effects, { packageId: svc.packageId }, (ifaces) =>
              ifaces
                .filter((i) => i.addressInfo?.hostId === svc.hostId)
                .map((i) => i.name),
            )
            .once()

          displayName = `${title} (${ifaceNames.join(', ')})`
        } else {
          displayName = 'StartOS (UI)'
        }

        return svc.ports.map((port) => ({
          type: 'single' as const,
          name: displayName,
          description: null,
          value:
            port.external === 80
              ? `http://${hostname}`
              : `http://${hostname}:${port.external}`,
          masked: false,
          copyable: true,
          qr: true,
        }))
      }),
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
