import { setupManifest } from '@start9labs/start-sdk'
import i18n from './i18n'

export const manifest = setupManifest({
  id: 'i2pd',
  title: 'I2Pd',
  license: 'BSD-3-Clause',
  packageRepo: 'https://github.com/Start9-Community/i2pd-startos',
  upstreamRepo: 'https://github.com/PurpleI2P/i2pd',
  marketingUrl: 'https://i2pd.website/',
  donationUrl: 'https://i2pd.website/en/donate',
  docsUrls: ['https://i2pd.readthedocs.io/'],
  description: i18n.description,
  volumes: ['i2pd'],
  images: {
    i2pd: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64', 'riscv64'],
    },
  },
  alerts: {
    install: i18n.alertInstall,
    uninstall: i18n.alertUninstall,
  },
  dependencies: {},
  plugins: ['url-v0'],
})
