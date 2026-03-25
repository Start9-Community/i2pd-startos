import { createHash, getDiffieHellman } from 'crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { base32 } from 'rfc4648'

/**
 * Generate a valid i2pd server tunnel key pair (.dat file) and derive the
 * correct .b32.i2p address from it.
 *
 * i2pd defaults: EdDSA-SHA512-ED25519 (sigType=7) + ElGamal (encType=0).
 * Uses RFC 3526 modp14 group (2048-bit prime) — the same group i2pd uses.
 *
 * Destination layout (391 bytes total):
 *   [0..255]   ElGamal public key           (256 bytes)
 *   [256..287] Ed25519 public key            (32 bytes, first 32 of 128-byte signingPublicKey field)
 *   [288..383] Zeros                         (96 bytes padding)
 *   [384]      Certificate type = 0x05       (KeyCertificate)
 *   [385..386] Certificate length = 0x0004   (4 bytes)
 *   [387..388] Signing key type = 0x0007     (EdDSA-SHA512-ED25519)
 *   [389..390] Encryption key type = 0x0000  (ElGamal)
 *
 * .dat file: [destination (391)] [Ed25519 seed (32)] [ElGamal private (256)] = 679 bytes
 *
 * .b32.i2p = base32(SHA256(destination))[0..51].toLowerCase() + ".b32.i2p"
 */
export function generateI2pKey(): { keyfile: Buffer; hostname: string } {
  // Ed25519 signing key pair
  const edSeed = ed25519.utils.randomSecretKey()
  const edPub = ed25519.utils.getExtendedPublicKey(edSeed).pointBytes

  // ElGamal encryption key pair — i2p uses RFC 3526 modp14 (2048-bit DH group)
  const elg = getDiffieHellman('modp14')
  elg.generateKeys()

  // Pad keys to exactly 256 bytes (big-endian, in case DH drops leading zeros)
  const elgPub = Buffer.alloc(256)
  const elgPriv = Buffer.alloc(256)
  const pubKey = elg.getPublicKey()
  const privKey = elg.getPrivateKey()
  pubKey.copy(elgPub, 256 - pubKey.length)
  privKey.copy(elgPriv, 256 - privKey.length)

  // Build the 391-byte i2p Destination
  const destination = Buffer.alloc(391)
  elgPub.copy(destination, 0)           // ElGamal pub → bytes 0-255
  destination.set(edPub, 256)           // Ed25519 pub → bytes 256-287
  destination[384] = 0x05               // KeyCertificate
  destination.writeUInt16BE(4, 385)     // cert length = 4
  destination.writeUInt16BE(7, 387)     // sigType = EdDSA-SHA512-ED25519
  destination.writeUInt16BE(0, 389)     // encType = ElGamal

  // .b32.i2p = base32(SHA256(destination)), no padding, lowercase
  const hash = createHash('sha256').update(destination).digest()
  const hostname = base32.stringify(hash, { pad: false }).toLowerCase() + '.b32.i2p'

  // .dat file = destination + private keys (i2pd reads: signing key first, then crypto key)
  const keyfile = Buffer.concat([destination, Buffer.from(edSeed), elgPriv])

  return { keyfile, hostname }
}
