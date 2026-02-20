import { sdk } from '../sdk'
import { addOnionService } from './addOnionService'
import { deleteOnionService } from './deleteOnionService'
import { manageOnionServices } from './manageOnionServices'
import { viewOnionAddresses } from './viewOnionAddresses'
import { configureRelay } from './configureRelay'
import { migrateOnionAddresses } from './migrateOnionAddresses'

export const actions = sdk.Actions.of()
  .addAction(addOnionService)
  .addAction(deleteOnionService)
  .addAction(manageOnionServices)
  .addAction(viewOnionAddresses)
  .addAction(configureRelay)
  .addAction(migrateOnionAddresses)
