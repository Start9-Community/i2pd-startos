import { i2pdConfig, syncConfigToFiles } from '../fileModels/i2pd'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  floodfill: Value.toggle({
    name: i18n('Floodfill'),
    description: i18n(
      'Participate as a floodfill router. Requires stable uptime, port forwarding, and at least Standard bandwidth.',
    ),
    default: false,
  }),
  bandwidth: Value.select({
    name: i18n('Bandwidth'),
    description: i18n('Maximum bandwidth for I2P traffic'),
    default: 'O',
    values: {
      L: i18n('Low (32 KB/s)'),
      O: i18n('Standard (256 KB/s)'),
      P: i18n('High (full speed)'),
      X: i18n('Unlimited'),
    },
  }),
  transit: Value.toggle({
    name: i18n('Transit Tunnels'),
    description: i18n('Relay traffic for other I2P users'),
    default: true,
  }),
  loglevel: Value.select({
    name: i18n('Log Level'),
    description: i18n('Logging verbosity for I2Pd'),
    default: 'warn',
    values: {
      none: i18n('None'),
      error: i18n('Error'),
      warn: i18n('Warning'),
      info: i18n('Info'),
      debug: i18n('Debug'),
    },
  }),
})

export const configureRouter = sdk.Action.withInput(
  'configure-router',

  async () => ({
    name: i18n('Configure Router'),
    description: i18n('Configure I2P router settings'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const config = await i2pdConfig.read().once()
    return {
      floodfill: config?.floodfill?.enabled ?? false,
      bandwidth: config?.router?.bandwidth ?? 'O',
      transit: config?.router?.transit ?? true,
      loglevel: config?.router?.loglevel ?? 'warn',
    }
  },

  async ({ effects, input }) => {
    // Reject floodfill with low bandwidth — it wastes resources without contributing
    if (input.floodfill && input.bandwidth === 'L') {
      return {
        version: '1' as const,
        title: i18n('Cannot Enable Floodfill'),
        message: i18n(
          'Floodfill requires at least Standard (O) bandwidth. Increase the bandwidth setting first.',
        ),
        result: null,
      }
    }

    const config = await i2pdConfig.read().once()

    const updatedConfig = {
      i2pServices: config?.i2pServices ?? {},
      floodfill: { enabled: input.floodfill },
      router: {
        bandwidth: input.bandwidth,
        transit: input.transit,
        loglevel: input.loglevel,
      },
    }

    await i2pdConfig.write(effects, updatedConfig)
    await syncConfigToFiles(updatedConfig)

    // i2pd doesn't hot-reload i2pd.conf — restart the service to apply changes
    await effects.restart()
  },
)
