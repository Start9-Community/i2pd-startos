import { nextKey, torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value, List, Variants } = sdk

export const inputSpec = InputSpec.of({
  services: Value.list(
    List.obj(
      { name: i18n('Onion Services') },
      {
        displayAs: '{{service.selection}}',
        spec: InputSpec.of({
          service: Value.dynamicUnion(async ({ effects }) => {
            const packages = await sdk.getInstalledPackages(effects)

            const allEntries = await Promise.all(
              packages.map(async (packageId) => {
                const title =
                  (await sdk
                    .getServiceManifest(effects, packageId, (m) => m?.title)
                    .const()) ?? packageId

                const iFaces = await sdk.serviceInterface
                  .getAll(effects, { packageId }, (ifaces) =>
                    ifaces
                      .filter((i) => i.addressInfo && i.host)
                      .map((i) => ({
                        name: i.name,
                        hostId: i.addressInfo!.hostId,
                      })),
                  )
                  .once()

                if (iFaces.length === 0) return null

                return getHostSpec(packageId, title, iFaces)
              }),
            )
            const entries = allEntries.filter(
              (e): e is NonNullable<typeof e> => e !== null,
            )

            return {
              name: i18n('Service'),
              default: '',
              disabled: false,
              variants: Variants.of(
                Object.fromEntries(
                  [
                    getHostSpec('STARTOS', 'StartOS', [
                      { name: 'UI', hostId: 'main' },
                    ]),
                  ].concat(entries),
                ),
              ),
            }
          }),
        }),
      },
    ),
  ),
})

export const manageOnionServices = sdk.Action.withInput(
  // id
  'manage-onion-services',

  // metadata
  async ({ effects }) => ({
    name: i18n('Manage Onion Services'),
    description: i18n('Add and remove Tor onion services'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // input spec
  inputSpec,

  // pre-fill form
  async ({ effects }) => {
    const config = await torrc.read().once()
    const onionServices = config?.onionServices || {}

    const services: {
      service: {
        selection: string
        value: { host: { selection: string; value: Record<string, never> } }
      }
    }[] = []

    for (const [packageId, hosts] of Object.entries(onionServices)) {
      for (const [hostId, entries] of Object.entries(hosts)) {
        for (const _key of Object.keys(entries)) {
          services.push({
            service: {
              selection: packageId,
              value: {
                host: { selection: hostId, value: {} },
              },
            },
          })
        }
      }
    }

    return { services }
  },

  // execution function
  async ({ effects, input }) => {
    const onionServices: Record<
      string,
      Record<
        string,
        Record<
          string,
          {
            ports: Record<
              string,
              { target: string; ssl: boolean; internalPort: number }
            >
          }
        >
      >
    > = {}

    await Promise.all(
      input.services.map(async (entry) => {
        const { selection: packageId, value } = entry.service as {
          selection: string
          value: {
            host: { selection: string; value: Record<string, never> }
          }
        }
        const hostId = value.host.selection

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
          ports = {}
          if (host) {
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
        }

        if (!onionServices[packageId]) onionServices[packageId] = {}
        if (!onionServices[packageId][hostId])
          onionServices[packageId][hostId] = {}
        const key = nextKey(onionServices[packageId][hostId])
        onionServices[packageId][hostId][key] = { ports }
      }),
    )

    const config = await torrc.read().once()
    await torrc.write(effects, {
      ...config,
      relay: config?.relay ?? { enabled: false },
      onionServices,
    })
  },
)

function getHostSpec(
  packageId: string,
  packageTitle: string,
  iFaces: { name: string; hostId: string }[],
) {
  // Group interfaces by hostId
  const byHost = new Map<string, string[]>()
  for (const iface of iFaces) {
    const names = byHost.get(iface.hostId)
    if (names) {
      names.push(iface.name)
    } else {
      byHost.set(iface.hostId, [iface.name])
    }
  }

  return [
    packageId,
    {
      name: packageTitle,
      spec: InputSpec.of({
        host: Value.union({
          name: i18n('Service Interface'),
          default: [...byHost.keys()][0] ?? '',
          variants: Variants.of(
            Object.fromEntries(
              [...byHost.entries()].map(([hostId, names]) => [
                hostId,
                {
                  name: names.join(', '),
                  spec: InputSpec.of({}),
                },
              ]),
            ),
          ),
        }),
      }),
    },
  ] as const
}
