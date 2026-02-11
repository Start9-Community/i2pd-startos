import { writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { torrc } from './fileModels/torrc'
import type { HealthCheckResult } from '@start9labs/start-sdk/package/lib/health/checkFns'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info('Starting Tor!')

  const config = await torrc.read((s) => s).const(effects)

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

  // Write custom private keys for onion services that have them
  const onionServices = config?.onionServices || {}
  for (const [key, svc] of Object.entries(onionServices)) {
    if (svc.privateKey) {
      await sdk.volumes.tor.writeFile(
        `hs_${key}/hs_ed25519_secret_key`,
        Buffer.from(svc.privateKey, 'base64'),
      )
    }
  }

  // Write torrc to subcontainer rootfs
  await writeFile(
    `${torSub.rootfs}/etc/tor/torrc`,
    torrc.writeData(config || { onionServices: {}, relay: undefined }),
  )

  return sdk.Daemons.of(effects)
    .addOneshot('chown', {
      subcontainer: torSub,
      exec: {
        command: ['sh', '-c', 'chmod 700 /var/lib/tor && chown -R tor:tor /var/lib/tor'],
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
