import { sdk } from '../sdk'
import { setDependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { versionGraph } from '../versions'
import { actions } from '../actions'
import { restoreInit } from '../backups'
import { registerUrlPlugin, exportUrls } from '../plugin/url'
import { migrateI2pAddresses } from './migrateI2pAddresses'
import { seedI2pdConfig } from './seedI2pdConfig'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  seedI2pdConfig,
  setInterfaces,
  setDependencies,
  actions,
  registerUrlPlugin,
  migrateI2pAddresses,
  exportUrls,
)

export const uninit = sdk.setupUninit(versionGraph)
