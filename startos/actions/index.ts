import { sdk } from '../sdk'
import { addOnionService } from './addOnionService'
import { deleteOnionService } from './deleteOnionService'
import { configureRelay } from './configureRelay'

export const actions = sdk.Actions.of()
  .addAction(addOnionService)
  .addAction(deleteOnionService)
  .addAction(configureRelay)
