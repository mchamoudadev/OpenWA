import { ConfigService } from '@nestjs/config';

/**
 * Runtime feature flags, centralised so every flag's env-var name and default lives in one place
 * instead of being read inline from `process.env` at each call site. Surfaced through
 * `ConfigService` as `features.*` (see `configuration.ts`) and their canonical boolean values are
 * validated at boot (see `env.validation.ts`).
 */
export interface FeatureFlags {
  /** Auto-start previously-authenticated sessions on boot. Opt-in — default OFF. */
  autoStartSessions: boolean;
  /** Persist + dispatch incoming disappearing-message-timer messages. Default ON. */
  storeEphemeralMessages: boolean;
  /** Inline @lid -> phone resolution for inbound privacy-id senders. Opt-in — default OFF. */
  resolveLidToPhone: boolean;
  /** Humanising typing indicator before single (non-bulk) sends. Default ON. */
  simulateTyping: boolean;
  /** Upper bound (ms) on the humanising typing pause. Default 5000. */
  simulateTypingMaxMs: number;
  /**
   * Minimum jittered gap (ms) between CONSECUTIVE single sends on one session
   * (anti-ban: prevents same-second reply volleys across many chats). The
   * actual gap is 0.6x–1.4x this value. Default 3000; 0 disables the gap
   * (sends stay serialised).
   */
  sendMinGapMs: number;
}

/**
 * Derive the feature-flag set from an environment map. Pure and parameterised for testability. The
 * comparisons intentionally mirror the exact semantics of the original inline reads so behaviour is
 * unchanged:
 *   - `=== 'true'`  → opt-in flag (default false)
 *   - `!== 'false'` → opt-out flag (default true)
 * and the max-ms parse mirrors the original `Number(x) || 5000` — 0, negative, empty and non-numeric
 * values all fall back to 5000 (note this differs from `parseInt`, which would keep a literal 0).
 */
export function computeFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return {
    autoStartSessions: env.AUTO_START_SESSIONS === 'true',
    storeEphemeralMessages: env.STORE_EPHEMERAL_MESSAGES !== 'false',
    resolveLidToPhone: env.RESOLVE_LID_TO_PHONE === 'true',
    simulateTyping: env.SIMULATE_TYPING !== 'false',
    simulateTypingMaxMs: Number(env.SIMULATE_TYPING_MAX_MS) || 5000,
    // Unlike the `|| default` parses above, an EXPLICIT 0 is honoured here (it
    // means "no inter-send gap"); absent/invalid values fall back to 3000.
    sendMinGapMs:
      env.SEND_MIN_GAP_MS !== undefined && Number.isFinite(Number(env.SEND_MIN_GAP_MS))
        ? Math.max(0, Number(env.SEND_MIN_GAP_MS))
        : 3000,
  };
}

/**
 * Resolve the flags, preferring the `ConfigService`-loaded set (the boot-time snapshot built by
 * `configuration.ts`) and falling back to a live `process.env` read when `ConfigService` is absent —
 * e.g. a unit test that constructs a service without the global `ConfigModule`. Environment variables
 * do not change during a process's lifetime, so the snapshot and a live read are equivalent in
 * production; the fallback exists purely to preserve the live-read behaviour that unit tests rely on
 * when they mutate `process.env`.
 */
export function resolveFeatureFlags(configService?: Pick<ConfigService, 'get'>): FeatureFlags {
  const fromConfig = configService?.get<FeatureFlags>('features');
  return fromConfig ?? computeFeatureFlags();
}
