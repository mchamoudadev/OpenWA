import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../session/entities/session.entity';
import { CaawiyeSignatureService } from './caawiye-signature.service';
import { CaawiyeSessionVaultService } from './caawiye-session-vault.service';
import { CaawiyePlatformService } from './caawiye-platform.service';
import { CaawiyeSessionLifecycleService } from './caawiye-session-lifecycle.service';
import { CaawiyeHealthController } from './caawiye-health.controller';

/**
 * Caawiye platform integration (P3-T1).
 *
 * A THIN, opt-in bridge between the OpenWA gateway and the Caawiye AI platform,
 * added on the `caawiye-integration` branch. It reuses the fork's own mechanisms
 * (the `message:received` hook seam, LocalAuth, the standard send + auth stack)
 * and adds only:
 *   - inbound forwarding to the platform webhook (HMAC-signed);
 *   - session-at-rest encryption (AES-256-GCM, key from WA_SESSION_KEY);
 *   - a health endpoint (+ canary concept) for the P3-T4 health cron.
 *
 * Every piece is inert unless its env is set, so the stock fork behaviour is
 * unchanged by default. `HookManager` and `ConfigService` are global; only the
 * `Session` repo on the `data` connection is imported here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Session], 'data')],
  controllers: [CaawiyeHealthController],
  providers: [
    CaawiyeSignatureService,
    CaawiyeSessionVaultService,
    CaawiyePlatformService,
    CaawiyeSessionLifecycleService,
  ],
  exports: [CaawiyeSignatureService, CaawiyeSessionVaultService],
})
export class CaawiyeModule {}
