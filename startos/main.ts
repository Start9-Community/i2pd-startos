import * as http from 'http'
import type { HealthCheckResult } from '@start9labs/start-sdk/package/lib/health/checkFns'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info('Starting I2Pd!')

  const i2pdSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'i2pd' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'i2pd',
      subpath: null,
      mountpoint: '/var/lib/i2pd',
      readonly: false,
    }),
    'i2pd-sub',
  )

  return (
    sdk.Daemons.of(effects)
      // Fix permissions before the daemon starts — the volume is created as root
      // but I2Pd runs as the 'i2pd' user
      .addOneshot('fix-perms', {
        subcontainer: i2pdSub,
        exec: {
          command: [
            'sh',
            '-c',
            'chmod -R 755 /var/lib/i2pd && chown -R i2pd:i2pd /var/lib/i2pd',
          ],
          user: 'root',
        },
        requires: [],
      })
      .addDaemon('i2pd', {
        subcontainer: i2pdSub,
        exec: {
          // Shell wrapper traps SIGTERM to trigger i2pd's graceful shutdown.
          // Graceful shutdown announces tunnel withdrawal so peers stop routing
          // to our tunnels immediately, instead of timing out for ~10 minutes.
          command: [
            'sh',
            '-c',
            'i2pd --conf=/var/lib/i2pd/i2pd.conf --datadir=/var/lib/i2pd & PID=$!; trap "wget -q -O /dev/null http://127.0.0.1:7070/?cmd=shutdown_graceful 2>/dev/null || kill $PID 2>/dev/null; wait $PID; exit 0" TERM; wait $PID',
          ],
        },
        ready: {
          display: i18n('I2P Network'),
          fn: checkBootstrap,
        },
        requires: ['fix-perms'],
      })
  )
})

/**
 * Checks I2Pd's HTTP API on 127.0.0.1:7070.
 * Uses http.request (not fetch) — Node.js 20 undici sends lowercase header
 * names which i2pd rejects with 403 "host mismatch".
 * http.request sends a capitalized Host header and gets 200 OK.
 */
function checkBootstrap(): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 7070, path: '/', method: 'GET' },
      (res) => {
        res.resume() // drain response body
        if (res.statusCode === 200) {
          resolve({ result: 'success', message: i18n('I2Pd is running') })
        } else {
          resolve({ result: 'failure', message: i18n('I2Pd HTTP API error') })
        }
      },
    )
    req.setTimeout(5000, () => {
      req.destroy()
      resolve({ result: 'failure', message: i18n('I2Pd is not responding') })
    })
    req.on('error', () => {
      // ECONNREFUSED means i2pd hasn't opened the webconsole yet — still starting
      resolve({ result: 'loading', message: i18n('I2Pd is starting up') })
    })
    req.end()
  })
}
