import { i18n } from './i18n'
import { sdk } from './sdk'
import { torrc } from './fileModels/torrc'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const relay = await torrc.read((s) => s.relay).const(effects)

  if (!relay?.enabled) return []

  const orPort = relay.orPort ?? 9001

  const orMulti = sdk.MultiHost.of(effects, 'or-multi')
  const orOrigin = await orMulti.bindPort(orPort, {
    protocol: null,
    preferredExternalPort: orPort,
    addSsl: null,
    secure: null,
  })

  const orInterface = sdk.createInterface(effects, {
    name: i18n('Tor Relay OR Port'),
    id: 'or',
    description: i18n('Tor relay port for the Tor network'),
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  const receipt = await orOrigin.export([orInterface])
  return [receipt]
})
