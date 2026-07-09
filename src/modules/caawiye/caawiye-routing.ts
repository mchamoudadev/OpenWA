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
 * Strip a whatsapp-web.js chat id to the bare MSISDN the platform stores as
 * `externalUserId` (`2526...@c.us` -> `2526...`). Non-suffixed input passes
 * through unchanged.
 */
export function toExternalUserId(waChatId: string): string {
  const at = waChatId.indexOf('@');
  return at === -1 ? waChatId : waChatId.slice(0, at);
}
