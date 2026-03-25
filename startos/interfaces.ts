import { i18n } from './i18n'
import { sdk } from './sdk'
import { i2pdConfig } from './fileModels/i2pd'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  // I2P exposes SOCKS proxy on port 4447 (i2p network only)
  // and HTTP proxy on port 4444 (i2p network only)
  // These are not general privacy proxies like Tor's SOCKS5

  const socksMulti = sdk.MultiHost.of(effects, 'socks-multi')
  const socksOrigin = await socksMulti.bindPort(4447, {
    protocol: null,
    preferredExternalPort: 4447,
    addSsl: null,
    secure: null,
  })

  const socksInterface = sdk.createInterface(effects, {
    name: i18n('I2P SOCKS Proxy'),
    id: 'socks',
    description: i18n('SOCKS proxy for I2P network (i2p addresses only)'),
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  const httpMulti = sdk.MultiHost.of(effects, 'http-multi')
  const httpOrigin = await httpMulti.bindPort(4444, {
    protocol: null,
    preferredExternalPort: 4444,
    addSsl: null,
    secure: null,
  })

  const httpInterface = sdk.createInterface(effects, {
    name: i18n('I2P HTTP Proxy'),
    id: 'http',
    description: i18n('HTTP proxy for I2P network (i2p addresses only)'),
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  const sockReceipt = await socksOrigin.export([socksInterface])
  const httpReceipt = await httpOrigin.export([httpInterface])

  return [sockReceipt, httpReceipt]
})
