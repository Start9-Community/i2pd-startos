import { sdk } from '../sdk'
import { addI2pTunnel } from './addI2pTunnel'
import { configureRouter } from './configureRouter'
import { deleteI2pTunnel } from './deleteI2pTunnel'
import { reseedRouter } from './reseedRouter'

export const actions = sdk.Actions.of()
  .addAction(addI2pTunnel)
  .addAction(deleteI2pTunnel)
  .addAction(configureRouter)
  .addAction(reseedRouter)
