import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * HMAC signing for the Caawiye inbound webhook (P3-T1).
 *
 * Scheme (MUST match the platform verifier in `@caawiye/channels`
 * `wa-qr/signature.ts`):
 *
 *   signature = "sha256=" + hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))
 *
 * Binding the timestamp INTO the signed material (not merely sending it
 * alongside) means a captured body cannot be re-timestamped, and the platform
 * additionally rejects a stale timestamp (replay window). The signature is
 * computed over the EXACT bytes that are sent on the wire — callers must sign the
 * same string they POST, never a re-serialisation.
 */
@Injectable()
export class CaawiyeSignatureService {
  /** Header carrying the epoch-ms timestamp bound into the signature. */
  static readonly TIMESTAMP_HEADER = 'X-Caawiye-Timestamp';
  /** Header carrying the `sha256=<hex>` signature. */
  static readonly SIGNATURE_HEADER = 'X-Caawiye-Signature';

  /** Compute `sha256=<hex>` for `(timestamp, rawBody)`. */
  sign(rawBody: string, timestamp: string | number, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.${rawBody}`);
    return `sha256=${hmac.digest('hex')}`;
  }
}
