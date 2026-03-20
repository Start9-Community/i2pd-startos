import { sdk } from '../sdk'
import { setDependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { versionGraph } from '../install/versionGraph'
import { actions } from '../actions'
import { restoreInit } from '../backups'
import { registerUrlPlugin, exportUrls } from '../plugin/url'
import { migrateOnionAddresses } from './migrateOnionAddresses'
import { seedTorrc } from './seedTorrc'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  seedTorrc,
  setInterfaces,
  setDependencies,
  actions,
  registerUrlPlugin,
  migrateOnionAddresses,
  exportUrls,
)

export const uninit = sdk.setupUninit(versionGraph)
