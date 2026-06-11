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
    secure: { ssl: false },
  })

  const socksInterface = sdk.createInterface(effects, {
    name: i18n('I2P SOCKS Proxy'),
    id: 'socks',
    description: i18n('SOCKS proxy for I2P network (i2p addresses only)'),
    type: 'api',
    masked: false,
    schemeOverride: { ssl: 'socks5', noSsl: 'socks5' },
    username: null,
    path: '',
    query: {},
  })

  const httpMulti = sdk.MultiHost.of(effects, 'http-multi')
  const httpOrigin = await httpMulti.bindPort(4444, {
    protocol: null,
    preferredExternalPort: 4444,
    addSsl: null,
    secure: { ssl: false },
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

  const consoleMulti = sdk.MultiHost.of(effects, 'console-multi')
  const consoleOrigin = await consoleMulti.bindPort(7070, {
    protocol: 'http',
    preferredExternalPort: 7070,
    addSsl: undefined,
  })

  const consoleInterface = sdk.createInterface(effects, {
    name: i18n('I2P Router Console'),
    id: 'console',
    description: i18n(
      'Web console for monitoring and managing the I2P router',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: { ssl: 'https', noSsl: 'http' },
    username: null,
    path: '',
    query: {},
  })

  const consoleReceipt = await consoleOrigin.export([consoleInterface])

  // Bind the SSU2 (UDP-like TCP fallback) and NTCP2 transport ports so
  // StartOS / UPnP can forward them from the external network.  Without
  // a consistent external port mapping i2pd shows "Firewalled - Symmetric NAT"
  // and inbound tunnel delivery fails, which breaks server tunnels.
  const ssu2Multi = sdk.MultiHost.of(effects, 'ssu2-multi')
  const ssu2Origin = await ssu2Multi.bindPort(4450, {
    protocol: null,
    preferredExternalPort: 4450,
    addSsl: null,
    secure: { ssl: false },
  })
  const ssu2Interface = sdk.createInterface(effects, {
    name: i18n('I2P SSU2 Transport'),
    id: 'ssu2',
    description: i18n('I2P SSU2 peer-to-peer transport port'),
    type: 'p2p',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  const ssu2Receipt = await ssu2Origin.export([ssu2Interface])

  const ntcp2Multi = sdk.MultiHost.of(effects, 'ntcp2-multi')
  const ntcp2Origin = await ntcp2Multi.bindPort(4451, {
    protocol: null,
    preferredExternalPort: 4451,
    addSsl: null,
    secure: { ssl: false },
  })
  const ntcp2Interface = sdk.createInterface(effects, {
    name: i18n('I2P NTCP2 Transport'),
    id: 'ntcp2',
    description: i18n('I2P NTCP2 peer-to-peer transport port'),
    type: 'p2p',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  const ntcp2Receipt = await ntcp2Origin.export([ntcp2Interface])

  return [sockReceipt, httpReceipt, consoleReceipt, ssu2Receipt, ntcp2Receipt]
})
