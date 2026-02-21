import { torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

export const relayInputSpec = InputSpec.of({
  enabled: Value.toggle({
    name: i18n('Enabled'),
    default: false,
  }),
  nickname: Value.text({
    name: i18n('Nickname'),
    description: null,
    required: false,
    default: 'StartOSRelay',
    placeholder: 'StartOSRelay',
    patterns: [
      {
        regex: '^[a-zA-Z0-9]{1,19}$',
        description: 'Must be 1-19 alphanumeric characters',
      },
    ],
    masked: false,
    inputmode: 'text',
    minLength: 1,
    maxLength: 19,
  }),
  contactInfo: Value.text({
    name: i18n('Contact Info'),
    description: null,
    required: false,
    default: null,
    placeholder: 'email@example.com',
    patterns: [],
    masked: false,
    inputmode: 'text',
    minLength: null,
    maxLength: null,
  }),
  bridge: Value.toggle({
    name: i18n('Bridge Mode'),
    default: false,
  }),
  orPort: Value.number({
    name: i18n('OR Port'),
    description: null,
    required: false,
    default: 9001,
    min: 1,
    max: 65535,
    integer: true,
    placeholder: null,
    units: null,
  }),
  bandwidthRate: Value.text({
    name: i18n('Bandwidth Rate'),
    description: null,
    required: false,
    default: '1 MBytes',
    placeholder: '1 MBytes',
    patterns: [],
    masked: false,
    inputmode: 'text',
    minLength: null,
    maxLength: null,
  }),
  bandwidthBurst: Value.text({
    name: i18n('Bandwidth Burst'),
    description: null,
    required: false,
    default: '2 MBytes',
    placeholder: '2 MBytes',
    patterns: [],
    masked: false,
    inputmode: 'text',
    minLength: null,
    maxLength: null,
  }),
})

export const configureRelay = sdk.Action.withInput(
  // id
  'configure-relay',

  // metadata
  async ({ effects }) => ({
    name: i18n('Configure Relay'),
    description: i18n('Configure Tor relay and bridge settings'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // input spec
  relayInputSpec,

  // pre-fill form
  async ({ effects }) => {
    const config = await torrc.read().once()
    const relay = config?.relay

    return {
      enabled: relay?.enabled ?? false,
      nickname: relay?.nickname ?? 'StartOSRelay',
      contactInfo: relay?.contactInfo ?? '',
      bridge: relay?.bridge ?? false,
      orPort: relay?.orPort ?? 9001,
      bandwidthRate: relay?.bandwidthRate ?? '1 MBytes',
      bandwidthBurst: relay?.bandwidthBurst ?? '2 MBytes',
    }
  },

  // execution function
  async ({ effects, input }) => {
    await torrc.merge(effects, {
      relay: {
        enabled: input.enabled,
        nickname: input.nickname ?? 'StartOSRelay',
        contactInfo: input.contactInfo ?? '',
        bridge: input.bridge,
        orPort: input.orPort ?? 9001,
        bandwidthRate: input.bandwidthRate ?? '1 MBytes',
        bandwidthBurst: input.bandwidthBurst ?? '2 MBytes',
      },
    })
  },
)
