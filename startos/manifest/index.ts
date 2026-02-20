import { setupManifest } from '@start9labs/start-sdk'
import i18n from './i18n'

export const manifest = setupManifest({
  id: 'tor',
  title: 'Tor',
  license: 'BSD-3-Clause',
  packageRepo: 'https://github.com/Start9Labs/tor-startos/',
  upstreamRepo: 'https://gitlab.torproject.org/tpo/core/tor/',
  marketingUrl: 'https://www.torproject.org/',
  donationUrl: 'https://donate.torproject.org/',
  docsUrls: ['https://community.torproject.org/onion-services/'],
  description: i18n.description,
  volumes: ['tor', 'start9'],
  images: {
    tor: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64', 'riscv64'],
    },
  },
  dependencies: {},
  plugins: ['url-v0'],
})
