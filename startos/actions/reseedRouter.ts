import * as http from 'http'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec } = sdk

/**
 * Fetches the i2pd webconsole main page and parses the known router count.
 * Returns the count, or null if the page can't be reached or parsed.
 */
function fetchRouterCount(): Promise<number | null> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: 7070, path: '/', method: 'GET' },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          // i2pd webconsole: <b>Routers:</b> 2500
          const match = body.match(/Routers:<\/b>\s*(\d+)/i)
          resolve(match ? Number(match[1]) : null)
        })
      },
    )
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const reseedRouter = sdk.Action.withInput(
  'reseed-router',

  async () => ({
    name: i18n('Reseed Router'),
    description: i18n(
      'Re-download router information from reseed servers',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  InputSpec.of({}),

  async () => null,

  async () => {
    const beforeCount = await fetchRouterCount()

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: 7070,
          path: '/?cmd=force_reseed',
          method: 'GET',
        },
        (res) => {
          res.resume()
          if (res.statusCode === 200 || res.statusCode === 302) {
            resolve()
          } else {
            reject(
              new Error(`Reseed returned HTTP ${res.statusCode}`),
            )
          }
        },
      )
      req.setTimeout(30000, () => {
        req.destroy()
        reject(new Error('Reseed request timed out'))
      })
      req.on('error', (e) => {
        reject(new Error(`Reseed failed: ${e.message}`))
      })
      req.end()
    })

    // Give i2pd time to contact reseed servers and integrate new routers
    await delay(5000)

    const afterCount = await fetchRouterCount()

    let message: string
    if (beforeCount !== null && afterCount !== null) {
      const diff = afterCount - beforeCount
      if (diff > 0) {
        message = `Reseed successful. Known routers: ${beforeCount} → ${afterCount} (+${diff}).`
      } else {
        message = `Reseed completed. Known routers: ${afterCount} (no change — router database may already be up to date).`
      }
    } else if (afterCount !== null) {
      message = `Reseed completed. Known routers: ${afterCount}.`
    } else {
      message =
        'Reseed was requested but could not verify the result. Check I2P logs for details.'
    }

    return {
      version: '1' as const,
      title: i18n('Reseed Results'),
      message,
      result: null,
    }
  },
)
