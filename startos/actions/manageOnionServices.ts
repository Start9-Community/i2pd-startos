import { torrc } from '../fileModels/torrc'
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

            const entries = await Promise.all(
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

                return getHostSpec(packageId, title, iFaces)
              }),
            )

            return {
              name: i18n('Service'),
              default: '',
              disabled: false,
              variants: Variants.of(
                Object.fromEntries(
                  [
                    getHostSpec('startos', 'StartOS', [
                      { name: 'UI', hostId: 'main' },
                    ]),
                  ].concat(entries),
                ),
              ),
            }
          }),
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
                description:
                  'Must be a valid base64 string',
              },
            ],
            masked: true,
            inputmode: 'text',
            minLength: 128,
            maxLength: 128,
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

    return {
      services: Object.values(onionServices).map((svc) => ({
        service: {
          selection: svc.packageId,
          value: {
            host: {
              selection: svc.hostId,
              value: {},
            },
          },
        },
        privateKey: svc.privateKey ?? null,
      })),
    }
  },

  // execution function
  async ({ effects, input }) => {
    const onionServices: Record<
      string,
      {
        packageId: string
        hostId: string
        ports: { external: number; internal: number }[]
        privateKey: string | undefined
      }
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
        const key = `${packageId}-${hostId}`

        let ports: { external: number; internal: number }[]

        if (packageId === 'startos') {
          ports = [{ external: 80, internal: 80 }]
        } else {
          const hosts = await sdk.serviceInterface
            .getAll(effects, { packageId }, (ifaces) =>
              ifaces
                .filter((i) => i.addressInfo?.hostId === hostId && i.host)
                .map((i) => i.host!),
            )
            .once()

          const host = hosts[0]
          if (host) {
            ports = Object.entries(host.bindings)
              .filter(([_, b]) => b.enabled)
              .map(([internalPort, b]) => ({
                external: b.options.preferredExternalPort,
                internal: Number(internalPort),
              }))
          } else {
            ports = []
          }
        }

        onionServices[key] = {
          packageId,
          hostId,
          ports,
          privateKey: entry.privateKey || undefined,
        }
      }),
    )

    await torrc.merge(effects, { onionServices })
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
