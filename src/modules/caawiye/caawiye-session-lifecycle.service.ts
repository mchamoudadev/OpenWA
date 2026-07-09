import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../common/services/logger.service';
import { HookManager } from '../../core/hooks';
import { HookContext, HookResult } from '../../core/hooks/hook.interfaces';
import { Session } from '../session/entities/session.entity';
import { CaawiyeSessionVaultService } from './caawiye-session-vault.service';

/**
 * Wires the session vault (P3-T1) into the session lifecycle WITHOUT touching
 * the core session service:
 *
 *   - `session:starting` hook  → UNSEAL the session's on-disk credentials before
 *     the engine boots, so a restart reuses them with no re-scan.
 *   - `OnApplicationShutdown`  → SEAL every session directory. Nest runs this
 *     strictly AFTER every provider's `onModuleDestroy`, and `SessionService`
 *     destroys its engines there — so Chromium's file handles are released
 *     before we archive + encrypt the directories.
 *
 * All of this is a no-op unless `WA_SESSION_KEY` is set (the vault is inert), so
 * the stock fork behaviour is preserved by default.
 */
@Injectable()
export class CaawiyeSessionLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = createLogger('CaawiyeSessionLifecycle');

  constructor(
    private readonly vault: CaawiyeSessionVaultService,
    private readonly config: ConfigService,
    private readonly hookManager: HookManager,
    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
  ) {}

  private sessionDataPath(): string {
    return path.resolve(this.config.get<string>('engine.sessionDataPath') ?? './data/sessions');
  }

  private sessionDir(name: string): string {
    return path.join(this.sessionDataPath(), `session-${name}`);
  }

  onModuleInit(): void {
    if (!this.vault.isEnabled()) {
      this.logger.log('Session-at-rest encryption disabled (set WA_SESSION_KEY to enable).');
      return;
    }
    this.hookManager.register('caawiye', 'session:starting', ctx => this.onSessionStarting(ctx), 10);
    this.logger.log('Session-at-rest encryption ACTIVE (AES-256-GCM, key from WA_SESSION_KEY).');
  }

  /** Unseal a session's directory (if a sealed blob exists) before it starts. */
  private async onSessionStarting(ctx: HookContext): Promise<HookResult> {
    const pass: HookResult = { continue: true, data: ctx.data };
    try {
      const data = ctx.data as { sessionId?: string } | undefined;
      const id = ctx.sessionId ?? data?.sessionId;
      if (!id) return pass;
      const session = await this.sessionRepository.findOne({ where: { id } });
      if (!session) return pass;
      const unsealed = await this.vault.unsealDirectory(this.sessionDir(session.name));
      if (unsealed) {
        this.logger.log(`Restored encrypted session before start: ${session.name}`);
      }
    } catch (err) {
      this.logger.error('Failed to unseal session on start', String(err));
    }
    return pass;
  }

  /** Seal every session directory at shutdown (engines are already destroyed). */
  async onApplicationShutdown(): Promise<void> {
    if (!this.vault.isEnabled()) return;
    const root = this.sessionDataPath();
    if (!fs.existsSync(root)) return;

    let sealed = 0;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('session-')) continue;
      try {
        const blob = await this.vault.sealDirectory(path.join(root, entry.name));
        if (blob) sealed++;
      } catch (err) {
        this.logger.error(`Failed to seal ${entry.name} at shutdown`, String(err));
      }
    }
    if (sealed > 0) this.logger.log(`Sealed ${sealed} session(s) at rest on shutdown.`);
  }
}
