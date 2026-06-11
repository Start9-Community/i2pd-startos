import { setupManifest } from '@start9labs/start-sdk'
import i18n from './i18n'

// Instructions are read from instructions.md at pack time by start-cli >= beta.9.
// Do NOT embed a duplicate instructions string here.

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
  volumes: ['i2pd'],
  plugins: ['url-v0'],
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

})
