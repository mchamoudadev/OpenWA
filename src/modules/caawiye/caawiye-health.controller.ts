import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../auth/decorators/auth.decorators';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { CaawiyeSessionVaultService } from './caawiye-session-vault.service';

/** Shape returned by the Caawiye health endpoint (polled by the P3-T4 cron). */
interface CaawiyeHealth {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  engine: string;
  whatsappWebJsVersion: string;
  sessionEncryption: 'enabled' | 'disabled';
  inboundForwarder: 'enabled' | 'disabled';
  sessions: {
    total: number;
    ready: number;
    disconnected: number;
    byStatus: Record<string, number>;
  };
  canary: { name: string | null; status: string | null; healthy: boolean | null };
}

/**
 * Caawiye health endpoint (P3-T1). A single public probe the platform's session
 * health cron (P3-T4) polls: it surfaces gateway liveness, the pinned
 * whatsapp-web.js version (the "wa-web breaks periodically" risk, PRD §17),
 * whether session-at-rest encryption is on, and the CANARY session's status —
 * the early-warning signal the health cron will alert on. The full cron lives in
 * P3-T4; this leaves it the endpoint to poll.
 */
@ApiTags('health')
@Controller('caawiye/health')
@Public()
export class CaawiyeHealthController {
  private readonly startedAt = Date.now();

  constructor(
    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
    private readonly config: ConfigService,
    private readonly vault: CaawiyeSessionVaultService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Caawiye integration health (gateway + sessions + canary)' })
  @ApiResponse({ status: 200, description: 'Health snapshot for the platform health cron (P3-T4)' })
  async health(): Promise<CaawiyeHealth> {
    const sessions = await this.sessionRepository.find();
    const byStatus: Record<string, number> = {};
    for (const s of sessions) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

    const canaryName = this.config.get<string>('caawiye.canarySession') || null;
    const canary = canaryName ? sessions.find(s => s.name === canaryName) : undefined;
    const canaryStatus = canary ? canary.status : null;
    const canaryHealthy = canaryName ? canary?.status === SessionStatus.READY : null;

    return {
      status: canaryName && canaryHealthy === false ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      engine: this.config.get<string>('engine.type') ?? 'whatsapp-web.js',
      whatsappWebJsVersion: readWwjsVersion(),
      sessionEncryption: this.vault.isEnabled() ? 'enabled' : 'disabled',
      inboundForwarder: this.config.get<boolean>('caawiye.enabled', false) ? 'enabled' : 'disabled',
      sessions: {
        total: sessions.length,
        ready: byStatus[SessionStatus.READY] || 0,
        disconnected: byStatus[SessionStatus.DISCONNECTED] || 0,
        byStatus,
      },
      canary: { name: canaryName, status: canaryStatus, healthy: canaryHealthy },
    };
  }
}

/** Read the pinned whatsapp-web.js version from its installed package.json. */
function readWwjsVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-member-access
    return (require('whatsapp-web.js/package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
}
