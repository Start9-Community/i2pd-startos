import { i2pdConfig, generateI2pdConf, generateTunnelsConf } from '../fileModels/i2pd'
import { writeFile } from 'fs/promises'
import { sdk } from '../sdk'
import { i18n } from '../i18n'

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
  externalHost: Value.text({
    name: i18n('External IP / Hostname'),
    description: i18n(
      'Public IP or hostname for incoming I2P connections. Set to your VPS or port-forwarded router IP to fix double-NAT Symmetric NAT classification. Requires UDP port 4450 forwarded to this machine. Leave blank to auto-detect.',
    ),
    required: false,
    default: null,
    patterns: [],
    minLength: null,
    maxLength: 253,
    placeholder: i18n('e.g. 203.0.113.10 or vpn.example.com'),
  }),
  reseedUrl: Value.text({
    name: i18n('Custom Reseed URL'),
    description: i18n(
      'HTTPS URL of a custom i2p reseed server (su3 format). Set to your own i2pd floodfill node\'s reseed endpoint to bootstrap the peer pool with known O-type peers from the start. Leave blank to use default reseed servers.',
    ),
    required: false,
    default: null,
    patterns: [
      {
        regex: '^https://',
        description: i18n('Must be an HTTPS URL'),
      },
    ],
    minLength: null,
    maxLength: 2048,
    placeholder: i18n('e.g. https://your-vps.example.com/i2pseeds.su3'),
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
      externalHost: config?.router?.externalHost ?? null,
      reseedUrl: config?.router?.reseedUrl ?? null,
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
        externalHost: input.externalHost ?? undefined,
        reseedUrl: input.reseedUrl ?? undefined,
      },
    }

    await i2pdConfig.write(effects, updatedConfig)
    await sdk.volumes.i2pd.writeFile('etc/i2pd/i2pd.conf', generateI2pdConf(updatedConfig))
    await sdk.volumes.i2pd.writeFile('etc/i2pd/tunnels.conf', generateTunnelsConf(updatedConfig))
    await effects.restart()
  },
)
