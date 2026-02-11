import { manageOnionServices } from '../actions/manageOnionServices'
import { torrc } from '../fileModels/torrc'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const taskAddOnionService = sdk.setupOnInit(async (effects, _) => {
  const config = await torrc.read().const(effects)

  if (!Object.keys(config?.onionServices || {}).length) {
    await sdk.action.createOwnTask(effects, manageOnionServices, 'critical', {
      reason: i18n('Create your first onion service'),
    })
  }
})
