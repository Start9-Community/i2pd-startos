import { setupManifest } from '@start9labs/start-sdk'
import i18n from './i18n'

export const manifest = setupManifest({
  id: 'tor',
  title: 'Tor',
  license: 'BSD-3-Clause',
  wrapperRepo: 'https://github.com/Start9Labs/tor-startos/',
  upstreamRepo: 'https://gitlab.torproject.org/tpo/core/tor/',
  supportSite: 'https://gitlab.torproject.org/tpo/core/tor/-/issues/',
  marketingSite: 'https://www.torproject.org/',
  donationUrl: 'https://donate.torproject.org/',
  docsUrl: 'https://community.torproject.org/onion-services/',
  description: i18n.description,
  volumes: ['tor'],
  images: {
    tor: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64', 'riscv64'],
    },
  },
  dependencies: {},
})
