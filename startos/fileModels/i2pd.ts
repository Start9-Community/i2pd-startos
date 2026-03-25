import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const portInfoShape = z.object({
  target: z.string(),
  ssl: z.boolean(),
  internalPort: z.number(),
})

export const i2pServiceEntryShape = z.object({
  ports: z.record(z.string(), portInfoShape),
})

export const floodfillShape = z.object({
  enabled: z.boolean().catch(false),
})

export const routerShape = z.object({
  bandwidth: z.enum(['L', 'O', 'P', 'X']).catch('O'),
  transit: z.boolean().catch(true),
  loglevel: z.enum(['none', 'error', 'warn', 'info', 'debug']).catch('warn'),
})

const shape = z.object({
  i2pServices: z
    .record(
      z.string(),
      z.record(z.string(), z.record(z.string(), i2pServiceEntryShape)),
    )
    .catch({}),
  floodfill: floodfillShape.catch({
    enabled: false,
  }),
  router: routerShape.catch({
    bandwidth: 'O',
    transit: true,
    loglevel: 'warn',
  }),
})

export type I2pdConfig = z.infer<typeof shape>

export function tunnelDir(packageId: string, hostId: string, index: string) {
  return `tunnels/${packageId}/${hostId}/tunnel_${index}`
}

/**
 * Returns the next sequential numeric key (as a string) for a record.
 * Gaps from deleted keys are intentionally NOT reused, since keys map to
 * tunnel directories containing cryptographic key material.
 */
export function nextKey(record: Record<string, unknown>): string {
  return String(
    Object.keys(record)
      .map(Number)
      .filter((n) => !isNaN(n))
      .reduce((acc, x) => (x >= acc ? x + 1 : acc), 0),
  )
}

/**
 * Generates the i2pd.conf main configuration file.
 * Parses through Zod before emitting — catches corrupt values before they crash i2pd.
 */
function generateI2pdConf(config: I2pdConfig): string {
  const router = routerShape.parse(config.router)
  const ff = floodfillShape.parse(config.floodfill)

  const lines: string[] = [
    '# i2pd configuration',
    'tunconf = /var/lib/i2pd/tunnels.conf',
    '',
    `loglevel = ${router.loglevel}`,
  ]

  // Bandwidth (omit when standard — i2pd defaults to O/256 KB/s)
  const bw = router.bandwidth
  if (bw !== 'O') {
    lines.push(`bandwidth = ${bw}`)
  }

  if (ff.enabled) {
    lines.push('floodfill = true')
  }
  lines.push('')

  lines.push('# HTTP API for health checks')
  lines.push('[http]')
  lines.push('enabled = true')
  lines.push('address = 127.0.0.1')
  lines.push('port = 7070')
  lines.push('')

  lines.push('[socksproxy]')
  lines.push('enabled = true')
  lines.push('address = 127.0.0.1')
  lines.push('port = 4447')
  lines.push('')

  lines.push('[ssu2]')
  lines.push('enabled = true')
  lines.push('')

  lines.push('[sam]')
  lines.push('enabled = true')
  lines.push('address = 127.0.0.1')
  lines.push('port = 7656')
  lines.push('')

  if (router.transit === false) {
    lines.push('[limits]')
    lines.push('transittunnels = 0')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generates the tunnels.conf file with server tunnel definitions.
 */
function generateTunnelsConf(config: I2pdConfig): string {
  const lines: string[] = ['# i2pd server tunnels', '']

  const i2pServices = config.i2pServices || {}
  for (const [packageId, hostsAny] of Object.entries(i2pServices)) {
    const hosts = hostsAny as any
    for (const [hostId, servicesAny] of Object.entries(hosts)) {
      const services = servicesAny as Record<string, any>
      for (const [index, svc] of Object.entries(services)) {
        if (Object.keys(svc.ports).length === 0) continue

        const tunnelName = `${packageId}-${hostId}-${index}`
        lines.push(`# @service ${packageId} ${hostId}`)
        lines.push(`[${tunnelName}]`)
        lines.push('type = server')
        lines.push(`keys = ${tunnelDir(packageId, hostId, index)}/${tunnelName}.dat`)

        // Get the first port info to determine host and inport
        const firstPort = Object.values(svc.ports)[0] as any
        if (firstPort) {
          const colonIdx = firstPort.target.lastIndexOf(':')
          const host = firstPort.target.slice(0, colonIdx)
          const port = firstPort.target.slice(colonIdx + 1)
          lines.push(`host = ${host}`)
          lines.push(`port = ${port}`)
        }

        // Add all ports to the tunnel
        for (const [externalPort, portInfoAny] of Object.entries(svc.ports)) {
          const portInfo = portInfoAny as any
          if (portInfo.ssl) lines.push(`# @ssl ${portInfo.internalPort}`)
          lines.push(`inport = ${externalPort}`)
        }

        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

/**
 * File helper that manages I2Pd config files.
 * Reads/writes JSON config and syncs to i2pd.conf and tunnels.conf.
 */
export const i2pdConfig = FileHelper.json(
  { base: sdk.volumes.i2pd, subpath: 'config.json' },
  shape,
)

/**
 * Syncs the JSON config to i2pd.conf and tunnels.conf files.
 * Call this after modifying i2pdConfig via merge().
 */
export async function syncConfigToFiles(config: I2pdConfig): Promise<void> {
  const i2pdConf = generateI2pdConf(config)
  const tunnelsConf = generateTunnelsConf(config)
  
  await sdk.volumes.i2pd.writeFile('i2pd.conf', i2pdConf)
  await sdk.volumes.i2pd.writeFile('tunnels.conf', tunnelsConf)
}
