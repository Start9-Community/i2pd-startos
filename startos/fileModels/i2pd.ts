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
  // When set, written as `host = <value>` in i2pd.conf.  i2pd then publishes
  // this IP/hostname in RouterInfo instead of auto-detecting through peer tests.
  // Auto-detection always returns "Symmetric NAT" under StartOS's double-NAT
  // (LXC bridge MASQUERADE + home router), so setting the external IP (e.g. a
  // VPS with port 4450 UDP forwarded to this machine) makes i2pd classify as
  // O-type and publish LeaseSets successfully.
  externalHost: z.string().regex(/^[^\n\r]*$/).optional().catch(undefined),
  // Custom reseed URL (su3-serving HTTPS endpoint).  Setting this to a
  // user-controlled floodfill node's reseed service ensures that the peer
  // pool at first boot already contains at least one O-type router, which
  // dramatically improves IBGW quality for the first tunnel builds.
  reseedUrl: z.string().url().optional().catch(undefined),
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
export function generateI2pdConf(config: I2pdConfig): string {
  const router = routerShape.parse(config.router)
  const ff = floodfillShape.parse(config.floodfill)

  const lines: string[] = [
    '# i2pd configuration',
    // Tunnels conf lives in the volume so hot-reloads via the HTTP API work.
    'tunconf = /var/lib/i2pd/etc/i2pd/tunnels.conf',
    '',
    `loglevel = ${router.loglevel}`,
  ]

  // Always emit bandwidth — if omitted, i2pd defaults to 'L' (low, <32 KB/s)
  // rather than 'O' (medium, 256 KB/s).  Low-bandwidth mode causes i2pd to
  // advertise 'L' caps, maintain fewer SSU2 sessions, and only publish 3
  // introduction records in the RouterInfo instead of the usual 8.  With only
  // 3 introducers, the 1800 ms LeaseSet-publication confirmation window is
  // rarely long enough for a floodfill to complete the introduction handshake,
  // causing persistent "Publish confirmation was not received" failures.
  const bw = router.bandwidth
  lines.push(`bandwidth = ${bw}`)

  // When an external host is configured, i2pd publishes that IP directly and
  // skips the peer-test-based NAT detection.  Without this, i2pd's peer test
  // observes that the SSU2 reply arrives on a different port than it sent from
  // (the LXC bridge MASQUERADE changes the source port) and permanently
  // classifies the router as "Symmetric NAT" (U caps), preventing direct
  // inbound connections.
  if (router.externalHost) {
    lines.push(`host = ${router.externalHost}`)
  }

  if (ff.enabled) {
    lines.push('floodfill = true')
  }

  // Explicit IPv4 + NAT flag; IPv6 is disabled because the LXC container
  // only has link-local / ULA IPv6 — attempting IPv6-only peers produces
  // "No compatible addresses available" noise and wastes build slots.
  lines.push('nat = true')
  lines.push('ipv4 = true')
  lines.push('ipv6 = false')
  lines.push('')

  lines.push('# Web console (also used for internal health checks)')
  lines.push('[http]')
  lines.push('enabled = true')
  // StartOS requirement: the web console must bind to 0.0.0.0 (not 127.0.0.1)
  // so the StartOS reverse proxy, which runs outside the i2pd subcontainer,
  // can reach it.  Restricting to loopback would make the console unreachable
  // from the StartOS UI entirely.
  lines.push('address = 0.0.0.0')
  lines.push('port = 7070')
  // StartOS requirement: the proxy forwards requests with its own Host header
  // (the .onion / LAN address), which differs from 127.0.0.1:7070.  i2pd's
  // strict-headers check would reject every proxied request with 403.
  // Authentication is handled by StartOS at its own layer, so disabling the
  // check here is safe within the StartOS security model.
  lines.push('strictheaders = false')
  lines.push('')

  lines.push('[httpproxy]')
  lines.push('enabled = true')
  // StartOS requirement: bind to 0.0.0.0 so the interface is reachable from
  // the host network through the LXC bridge, not just from within the container.
  lines.push('address = 0.0.0.0')
  lines.push('port = 4444')
  lines.push('')

  lines.push('[socksproxy]')
  lines.push('enabled = true')
  // Same StartOS requirement as [httpproxy] above.
  lines.push('address = 0.0.0.0')
  lines.push('port = 4447')
  lines.push('')

  lines.push('[ssu2]')
  lines.push('enabled = true')
  // Fixed port so StartOS can establish consistent port-forwarding rules.
  // Without a fixed port, i2pd picks a random one on each restart and the
  // router is permanently "Firewalled - Symmetric NAT", which prevents
  // inbound tunnel delivery and breaks server tunnels.
  lines.push('port = 4450')
  lines.push('')

  lines.push('[ntcp2]')
  lines.push('enabled = true')
  lines.push('port = 4451')
  lines.push('')

  // Shorter exploratory tunnels (1 hop instead of the default 2) make
  // netDb lookups — including the floodfill queries used to verify
  // LeaseSet publication — more reliable under NAT / firewalled conditions.
  lines.push('[exploratory]')
  lines.push('inbound.length = 1')
  lines.push('outbound.length = 1')
  lines.push('inbound.quantity = 3')
  lines.push('outbound.quantity = 3')
  lines.push('')

  // UPnP is intentionally disabled: the i2pd process runs inside an LXC
  // container whose default gateway is the LXC bridge (10.0.3.1), not the
  // home router.  SSDP discovery never reaches the home router, so UPnP
  // discovery always times out — adding noise without any benefit.
  // StartOS handles external port-forwarding at the host level instead.
  lines.push('[upnp]')
  lines.push('enabled = false')
  lines.push('')

  // NTP time sync — disabled by default upstream but important here.
  // Clock skew > a few seconds causes floodfills to reject DatabaseStore
  // messages (timestamp validation), which silently breaks LeaseSet
  // publication without any error distinguishable from the NAT issue.
  // frompeers = true also syncs from transport peers (works without outbound
  // UDP to pool.ntp.org, which may be firewalled in some home networks).
  lines.push('[nettime]')
  lines.push('enabled = true')
  lines.push('frompeers = true')
  lines.push('')

  if (router.reseedUrl) {
    // Point reseed at the user's own floodfill/reseed server so that after a
    // fresh install (or after the netDb is wiped) the router bootstraps with
    // at least one known O-type peer rather than an entirely random sample
    // from the default reseed servers.
    lines.push('[reseed]')
    lines.push(`urls = ${router.reseedUrl}`)
    lines.push('verify = true')
    lines.push('')
  }

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
 *
 * i2pd server tunnels accept exactly one `inport` per [section].
 * When a service has multiple external ports (e.g. HTTP port 80 + SSL port
 * 443), each port gets its own [section] that references the same .dat keys
 * file — so they all share the same .b32.i2p destination address.
 */
export function generateTunnelsConf(config: I2pdConfig): string {
  const lines: string[] = ['# i2pd server tunnels', '']

  for (const [packageId, hosts] of Object.entries(config.i2pServices)) {
    for (const [hostId, services] of Object.entries(hosts)) {
      for (const [index, svc] of Object.entries(services)) {
        if (Object.keys(svc.ports).length === 0) continue

        const baseName = `${packageId}-${hostId}-${index}`
        const keyPath = `${tunnelDir(packageId, hostId, index)}/${baseName}.dat`

        for (const [externalPort, portInfo] of Object.entries(svc.ports)) {
          // Each port is a separate [section] with a unique name but the same
          // keys file, so all ports resolve to the same .b32.i2p address.
          const sectionName = `${baseName}-p${externalPort}`
          const colonIdx = portInfo.target.lastIndexOf(':')
          const host = portInfo.target.slice(0, colonIdx)
          const port = portInfo.target.slice(colonIdx + 1)

          lines.push(`# @service ${packageId} ${hostId}`)
          if (portInfo.ssl) lines.push(`# @ssl ${portInfo.internalPort}`)
          lines.push(`[${sectionName}]`)
          lines.push('type = server')
          lines.push(`keys = ${keyPath}`)
          lines.push(`host = ${host}`)
          lines.push(`port = ${port}`)
          lines.push(`inport = ${externalPort}`)
          // Under StartOS's double-NAT (LXC bridge + home router) the i2pd
          // router is always firewalled (X-type / no published direct address).
          // inbound.length = 0 would make OUR router the IBGW, but since we
          // have no published endpoint nobody can open a connection to us and
          // the server tunnel is completely unreachable.
          // With inbound.length = 1, i2pd selects an O-type (reachable) peer
          // as the one-hop IBGW.  Remote clients connect to that O-type peer
          // and it forwards data through the tunnel to us — no direct
          // reachability of our router required.  LeaseSet-publication
          // confirmations also flow back through this inbound tunnel (not via
          // SSU2 introduction), so they succeed regardless of our NAT type.
          lines.push('inbound.length = 1')
          lines.push('outbound.length = 1')
          // 10 inbound paths → wider draw from the peer pool, significantly
          // raising the probability that at least one selected IBGW is O-type
          // (directly reachable) rather than all being X-type (firewalled).
          // O-type IBGWs allow floodfills to deliver LeaseSet confirmations
          // within the 1800 ms window; X-type IBGWs require a full SSU2
          // introduction handshake that frequently exceeds that budget.
          lines.push('inbound.quantity = 10')
          lines.push('outbound.quantity = 5')
          lines.push('')
        }
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

