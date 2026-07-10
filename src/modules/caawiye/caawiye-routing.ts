/**
 * Caawiye routing key (P3-T1) — gateway half.
 *
 * The platform chooses each OpenWA session's NAME so that it encodes the tenant
 * and channel it belongs to:
 *
 *   caw_<tenantIdHex32>_<channelIdHex32>
 *
 * The gateway echoes this name back on every inbound webhook so the platform can
 * recover `(tenantId, channelId)` under its row-level-security scope. This file
 * MUST stay byte-compatible with the platform copy in
 * `@caawiye/channels` `packages/channels/src/wa-qr/routing.ts`.
 */

/** Prefix that identifies a Caawiye-managed session name. */
export const CAAWIYE_SESSION_NAME_PREFIX = 'caw_';

const HEX32 = /^[0-9a-f]{32}$/;

/** True when `name` is a Caawiye routing key. */
export function isCaawiyeSessionName(name: string | null | undefined): boolean {
  if (typeof name !== 'string' || !name.startsWith(CAAWIYE_SESSION_NAME_PREFIX)) return false;
  const parts = name.slice(CAAWIYE_SESSION_NAME_PREFIX.length).split('_');
  return parts.length === 2 && HEX32.test(parts[0]) && HEX32.test(parts[1]);
}

/**
 * Return the FULL canonical WhatsApp address the platform stores as
 * `externalUserId` and must reply to VERBATIM. The domain suffix is PRESERVED so
 * a privacy id (`<lid>@lid`) is never mislabeled as a phone (`<phone>@c.us`):
 * `2526...@c.us` and `170725...@lid` both pass through unchanged, as does a bare
 * value with no suffix. Kept byte-compatible with the platform copy in
 * `@caawiye/channels` `wa-qr/routing.ts` — what we store == what we reply to.
 */
export function toExternalUserId(waChatId: string): string {
  return waChatId;
}
