import { mkdir, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { hsDir, torrc } from './fileModels/torrc'
import type { HealthCheckResult } from '@start9labs/start-sdk/package/lib/health/checkFns'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info('Starting Tor!')

  const config = await torrc.read((s) => s).const(effects)

  // Create hidden service directories on the volume before Tor starts
  const onionServices = config?.onionServices || {}
  for (const [packageId, hosts] of Object.entries(onionServices)) {
    for (const [hostId, services] of Object.entries(hosts)) {
      for (const i of Object.keys(services)) {
        await mkdir(sdk.volumes.tor.subpath(hsDir(packageId, hostId, i)), {
          recursive: true,
        })
      }
    }
  }

  // Write torrc to subcontainer rootfs
  const torSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'tor' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'tor',
      subpath: null,
      mountpoint: '/var/lib/tor',
      readonly: false,
    }),
    'tor-sub',
  )

  await writeFile(
    `${torSub.rootfs}/etc/tor/torrc`,
    torrc.writeData(config || { onionServices: {}, relay: { enabled: false } }),
  )

  return sdk.Daemons.of(effects)
    .addOneshot('chown', {
      subcontainer: torSub,
      exec: {
        command: [
          'sh',
          '-c',
          'chmod -R 700 /var/lib/tor && chown -R tor:tor /var/lib/tor',
        ],
        user: 'root',
      },
      requires: [],
    })
    .addDaemon('tor', {
      subcontainer: torSub,
      exec: {
        command: sdk.useEntrypoint(),
      },
      ready: {
        display: i18n('Tor SOCKS Proxy'),
        fn: checkBootstrap,
      },
      requires: ['chown'],
    })
})

function checkBootstrap(): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const socket = connect(sdk.volumes.tor.subpath('control.sock'))
    let data = ''

    socket.setTimeout(5000)
    socket.on('connect', () => {
      socket.write('AUTHENTICATE\r\nGETINFO status/bootstrap-phase\r\nQUIT\r\n')
    })
    socket.on('data', (chunk) => {
      data += chunk.toString()
    })
    socket.on('end', () => {
      const match = data.match(/BOOTSTRAP PROGRESS=(\d+).*?SUMMARY="([^"]*)"/)
      if (!match) {
        resolve({ result: 'failure', message: i18n('Tor is not ready') })
        return
      }
      const progress = parseInt(match[1], 10)
      const summary = match[2]
      if (progress >= 100) {
        resolve({ result: 'success', message: i18n('Tor is running') })
      } else {
        resolve({
          result: 'loading',
          message: `Bootstrapping: ${progress}% - ${summary}`,
        })
      }
    })
    socket.on('error', () => {
      resolve({ result: 'failure', message: i18n('Tor is not ready') })
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ result: 'failure', message: i18n('Tor is not ready') })
    })
  })
}
