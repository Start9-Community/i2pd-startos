import { FileHelper, matches } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const { arrayOf, object, string, number, boolean, dictionary } = matches

const portPairShape = object({
  external: number,
  internal: number,
})

export const onionServiceShape = object({
  packageId: string,
  hostId: string,
  ports: arrayOf(portPairShape),
  privateKey: string.optional().onMismatch(undefined),
})

export const relayShape = object({
  enabled: boolean.optional().onMismatch(false),
  nickname: string.optional().onMismatch('StartOSRelay'),
  contactInfo: string.optional().onMismatch(''),
  bridge: boolean.optional().onMismatch(false),
  orPort: number.optional().onMismatch(9001),
  bandwidthRate: string.optional().onMismatch('1 MBytes'),
  bandwidthBurst: string.optional().onMismatch('2 MBytes'),
})

const shape = object({
  onionServices: dictionary([string, onionServiceShape])
    .optional()
    .onMismatch({}),
  relay: relayShape.optional().onMismatch({
    enabled: false,
    nickname: 'StartOSRelay',
    contactInfo: '',
    bridge: false,
    orPort: 9001,
    bandwidthRate: '1 MBytes',
    bandwidthBurst: '2 MBytes',
  }),
})

export type TorrcConfig = typeof shape._TYPE

function toFile(config: TorrcConfig): string {
  const lines: string[] = [
    'SocksPort 0.0.0.0:9050',
    'DataDirectory /var/lib/tor',
    'ControlSocket /var/lib/tor/control.sock',
    '',
  ]

  const onionServices = config.onionServices || {}
  for (const [key, svc] of Object.entries(onionServices)) {
    const metaParts = [key, svc.packageId, svc.hostId]
    if (svc.privateKey) metaParts.push(svc.privateKey)
    lines.push(`# @service ${metaParts.join(' ')}`)
    lines.push(`HiddenServiceDir /var/lib/tor/hs_${key}/`)
    const host =
      svc.packageId === 'startos' ? 'startos' : `${svc.packageId}.startos`
    for (const port of svc.ports) {
      lines.push(`HiddenServicePort ${port.external} ${host}:${port.internal}`)
    }
    lines.push('')
  }

  const relay = config.relay
  if (relay?.enabled) {
    lines.push(`ORPort ${relay.orPort}`)
    if (relay.nickname) lines.push(`Nickname ${relay.nickname}`)
    if (relay.contactInfo) lines.push(`ContactInfo ${relay.contactInfo}`)
    if (relay.bridge) lines.push('BridgeRelay 1')
    lines.push(`RelayBandwidthRate ${relay.bandwidthRate}`)
    lines.push(`RelayBandwidthBurst ${relay.bandwidthBurst}`)
    lines.push('ExitRelay 0')
    lines.push('')
  }

  return lines.join('\n')
}

function fromFile(raw: string): unknown {
  const onionServices: Record<string, unknown> = {}
  const relay: Record<string, unknown> = {}

  const lines = raw.split('\n')
  let currentMeta: {
    key: string
    packageId: string
    hostId: string
    privateKey?: string
  } | null = null
  let currentPorts: { external: number; internal: number }[] = []

  function flushCurrentService() {
    if (currentMeta && currentPorts.length > 0) {
      onionServices[currentMeta.key] = {
        packageId: currentMeta.packageId,
        hostId: currentMeta.hostId,
        ports: currentPorts,
        privateKey: currentMeta.privateKey,
      }
    }
    currentMeta = null
    currentPorts = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    const serviceMatch = trimmed.match(/^# @service (\S+) (\S+) (\S+)\s*(.*)$/)
    if (serviceMatch) {
      flushCurrentService()
      currentMeta = {
        key: serviceMatch[1],
        packageId: serviceMatch[2],
        hostId: serviceMatch[3],
        privateKey: serviceMatch[4] || undefined,
      }
      continue
    }

    if (trimmed.startsWith('HiddenServiceDir')) continue

    const portMatch = trimmed.match(/^HiddenServicePort (\d+)\s+\S+:(\d+)/)
    if (portMatch && currentMeta) {
      currentPorts.push({
        external: parseInt(portMatch[1], 10),
        internal: parseInt(portMatch[2], 10),
      })
      continue
    }

    let m
    if ((m = trimmed.match(/^ORPort (\d+)/))) {
      flushCurrentService()
      relay.enabled = true
      relay.orPort = parseInt(m[1], 10)
    } else if ((m = trimmed.match(/^Nickname (.+)/))) {
      relay.nickname = m[1]
    } else if ((m = trimmed.match(/^ContactInfo (.+)/))) {
      relay.contactInfo = m[1]
    } else if (trimmed === 'BridgeRelay 1') {
      relay.bridge = true
    } else if ((m = trimmed.match(/^RelayBandwidthRate (.+)/))) {
      relay.bandwidthRate = m[1]
    } else if ((m = trimmed.match(/^RelayBandwidthBurst (.+)/))) {
      relay.bandwidthBurst = m[1]
    }
  }

  flushCurrentService()

  return { onionServices, relay }
}

export const torrc = FileHelper.raw(
  { base: sdk.volumes.tor, subpath: '/torrc' },
  toFile,
  fromFile,
  (data) => shape.unsafeCast(data),
)
