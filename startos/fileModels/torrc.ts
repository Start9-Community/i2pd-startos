import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const portInfoShape = z.object({
  target: z.string(),
  ssl: z.boolean(),
  internalPort: z.number(),
})

export const onionServiceEntryShape = z.object({
  ports: z.record(z.string(), portInfoShape),
})

export const relayShape = z.object({
  enabled: z.boolean().catch(false),
  nickname: z.string().optional().catch(undefined),
  contactInfo: z.string().optional().catch(undefined),
  bridge: z.boolean().optional().catch(undefined),
  orPort: z.number().optional().catch(undefined),
  bandwidthRate: z.string().optional().catch(undefined),
  bandwidthBurst: z.string().optional().catch(undefined),
})

const shape = z.object({
  onionServices: z
    .record(
      z.string(),
      z.record(z.string(), z.record(z.string(), onionServiceEntryShape)),
    )
    .catch({}),
  relay: relayShape.catch({ enabled: false }),
})

export type TorrcConfig = z.infer<typeof shape>

export function hsDir(packageId: string, hostId: string, index: string) {
  return `hidden_services/${packageId}/${hostId}/hs_${index}`
}

export function nextKey(record: Record<string, unknown>): string {
  return String(
    Object.keys(record)
      .map(Number)
      .filter((n) => !isNaN(n))
      .reduce((acc, x) => (x >= acc ? x + 1 : acc), 0),
  )
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
      Object.entries(services).forEach(([index, svc]) => {
        lines.push(`# @service ${packageId} ${hostId}`)
        lines.push(
          `HiddenServiceDir /var/lib/tor/${hsDir(packageId, hostId, index)}/`,
        )
        for (const [externalPort, portInfo] of Object.entries(svc.ports)) {
          if (portInfo.ssl) lines.push(`# @ssl ${portInfo.internalPort}`)
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
  const res: z.infer<typeof shape> = {
    onionServices: {},
    relay: { enabled: false },
  }

  const lines = raw.split('\n')
  let currentPackageId: string | null = null
  let currentHostId: string | null = null
  let currentIndex: string | null = null
  let currentPorts: Record<
    string,
    { target: string; ssl: boolean; internalPort: number }
  > = {}
  let nextSslInternalPort: number | null = null

  function flushCurrent() {
    if (
      currentPackageId &&
      currentHostId &&
      currentIndex &&
      Object.keys(currentPorts).length > 0
    ) {
      if (!res.onionServices[currentPackageId])
        res.onionServices[currentPackageId] = {}
      if (!res.onionServices[currentPackageId][currentHostId])
        res.onionServices[currentPackageId][currentHostId] = {}
      res.onionServices[currentPackageId][currentHostId][currentIndex] = {
        ports: currentPorts,
      }
    }
    currentPackageId = null
    currentHostId = null
    currentIndex = null
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

    const hsDirMatch = trimmed.match(/\/hs_([^/]+)\/?$/)
    if (trimmed.startsWith('HiddenServiceDir') && hsDirMatch) {
      currentIndex = hsDirMatch[1]
      continue
    }

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
      res.relay.enabled = true
      res.relay.orPort = parseInt(m[1], 10)
    } else if ((m = trimmed.match(/^Nickname (.+)/))) {
      res.relay.nickname = m[1]
    } else if ((m = trimmed.match(/^ContactInfo (.+)/))) {
      res.relay.contactInfo = m[1]
    } else if (trimmed === 'BridgeRelay 1') {
      res.relay.bridge = true
    } else if ((m = trimmed.match(/^RelayBandwidthRate (.+)/))) {
      res.relay.bandwidthRate = m[1]
    } else if ((m = trimmed.match(/^RelayBandwidthBurst (.+)/))) {
      res.relay.bandwidthBurst = m[1]
    }
  }

  flushCurrent()

  return res
}

export const torrc = FileHelper.raw(
  { base: sdk.volumes.tor, subpath: '/torrc' },
  toFile,
  fromFile,
  (data) => shape.parse(data),
)
