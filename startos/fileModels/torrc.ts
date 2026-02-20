import { FileHelper, matches } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const { arrayOf, object, string, number, boolean, dictionary } = matches

const portInfoShape = object({
  target: string,
  ssl: boolean,
  internalPort: number,
})

export const onionServiceEntryShape = object({
  ports: dictionary([string, portInfoShape]),
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
  onionServices: dictionary([
    string,
    dictionary([string, arrayOf(onionServiceEntryShape)]),
  ])
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

export function hsDir(packageId: string, hostId: string, index: number) {
  return `hs_${packageId}_${hostId}_${index}`
}

function toFile(config: TorrcConfig): string {
  const lines: string[] = [
    'SocksPort 0.0.0.0:9050',
    'DataDirectory /var/lib/tor',
    'ControlSocket /var/lib/tor/control.sock',
    '',
  ]

  const onionServices = config.onionServices || {}
  for (const [packageId, hosts] of Object.entries(onionServices)) {
    for (const [hostId, services] of Object.entries(hosts)) {
      services.forEach((svc, index) => {
        lines.push(`# @service ${packageId} ${hostId}`)
        lines.push(
          `HiddenServiceDir /var/lib/tor/${hsDir(packageId, hostId, index)}/`,
        )
        for (const [externalPort, portInfo] of Object.entries(svc.ports)) {
          if (portInfo.ssl)
            lines.push(`# @ssl ${portInfo.internalPort}`)
          lines.push(`HiddenServicePort ${externalPort} ${portInfo.target}`)
        }
        lines.push('')
      })
    }
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
  const onionServices: Record<string, Record<string, unknown[]>> = {}
  const relay: Record<string, unknown> = {}

  const lines = raw.split('\n')
  let currentPackageId: string | null = null
  let currentHostId: string | null = null
  let currentPorts: Record<
    string,
    { target: string; ssl: boolean; internalPort: number }
  > = {}
  let nextSslInternalPort: number | null = null

  function flushCurrent() {
    if (
      currentPackageId &&
      currentHostId &&
      Object.keys(currentPorts).length > 0
    ) {
      if (!onionServices[currentPackageId])
        onionServices[currentPackageId] = {}
      if (!onionServices[currentPackageId][currentHostId])
        onionServices[currentPackageId][currentHostId] = []
      onionServices[currentPackageId][currentHostId].push({
        ports: currentPorts,
      })
    }
    currentPackageId = null
    currentHostId = null
    currentPorts = {}
    nextSslInternalPort = null
  }

  for (const line of lines) {
    const trimmed = line.trim()

    const serviceMatch = trimmed.match(/^# @service (\S+) (\S+)$/)
    if (serviceMatch) {
      flushCurrent()
      currentPackageId = serviceMatch[1]
      currentHostId = serviceMatch[2]
      continue
    }

    const sslMatch = trimmed.match(/^# @ssl (\d+)$/)
    if (sslMatch) {
      nextSslInternalPort = parseInt(sslMatch[1], 10)
      continue
    }

    if (trimmed.startsWith('HiddenServiceDir')) continue

    const portMatch = trimmed.match(/^HiddenServicePort (\d+)\s+(\S+)/)
    if (portMatch && currentPackageId) {
      const target = portMatch[2]
      if (nextSslInternalPort !== null) {
        currentPorts[portMatch[1]] = {
          target,
          ssl: true,
          internalPort: nextSslInternalPort,
        }
        nextSslInternalPort = null
      } else {
        // For non-SSL, internalPort is the port from the target (host:port)
        const colonIdx = target.lastIndexOf(':')
        const internalPort = parseInt(target.slice(colonIdx + 1), 10)
        currentPorts[portMatch[1]] = { target, ssl: false, internalPort }
      }
      continue
    }

    let m
    if ((m = trimmed.match(/^ORPort (\d+)/))) {
      flushCurrent()
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

  flushCurrent()

  return { onionServices, relay }
}

export const torrc = FileHelper.raw(
  { base: sdk.volumes.tor, subpath: '/torrc' },
  toFile,
  fromFile,
  (data) => shape.unsafeCast(data),
)
