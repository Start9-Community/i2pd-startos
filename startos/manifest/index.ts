import { setupManifest } from '@start9labs/start-sdk'
import i18n from './i18n'

export const manifest = setupManifest({
  id: 'i2p',
  title: 'I2P',
  license: 'GPL-2.0-or-later',
  packageRepo: 'https://github.com/crissuper20/i2p-startos',
  upstreamRepo: 'https://github.com/PurpleI2P/i2pd',
  marketingUrl: 'https://i2pd.website/',
  donationUrl: 'https://i2pd.website/en/donate',
  docsUrls: ['https://i2pd.readthedocs.io/'],
  description: i18n.description,
  volumes: ['i2pd', 'startos'],
  images: {
    i2pd: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64', 'riscv64'],
    },
  },
  alerts: {
    uninstall: i18n.alertUninstall,
  },
  dependencies: {},
  plugins: ['url-v0'],
})
