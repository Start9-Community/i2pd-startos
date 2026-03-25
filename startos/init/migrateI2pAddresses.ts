import { sdk } from '../sdk'

/**
 * Placeholder for future I2P address migrations (e.g. importing existing tunnel keys).
 * Currently a no-op — kept as a hook in the init chain.
 */
export const migrateI2pAddresses = sdk.setupOnInit(async (_effects) => {})
