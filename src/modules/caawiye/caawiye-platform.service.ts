import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { HookManager } from '../../core/hooks';
import { HookContext, HookResult } from '../../core/hooks/hook.interfaces';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { Session } from '../session/entities/session.entity';
import { CaawiyeSignatureService } from './caawiye-signature.service';
import { isCaawiyeSessionName, toExternalUserId } from './caawiye-routing';

/**
 * Inbound forwarder (P3-T1): OpenWA -> Caawiye platform.
 *
 * Registers a `message:received` hook (the fork's sanctioned extension seam — no
 * core edits) and forwards each customer message to the platform webhook,
 * HMAC-signed per the Caawiye contract. It only forwards messages on sessions
 * whose NAME is a Caawiye routing key (`caw_<tenantHex>_<channelHex>`), so a
 * mixed gateway hosting non-Caawiye sessions is unaffected.
 *
 * Isolation: a platform outage only fails THIS forward (logged, swallowed by the
 * hook runner). It never blocks the gateway, the WA connection, or other hooks.
 */
@Injectable()
export class CaawiyePlatformService implements OnModuleInit {
  private readonly logger = createLogger('CaawiyePlatform');

  constructor(
    private readonly hookManager: HookManager,
    private readonly config: ConfigService,
    private readonly signature: CaawiyeSignatureService,
    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
  ) {}

  onModuleInit(): void {
    if (!this.isConfigured()) {
      this.logger.log('Caawiye inbound forwarder disabled (set CAAWIYE_ENABLED, CAAWIYE_WEBHOOK_URL, WA_WEBHOOK_SECRET).');
      return;
    }
    // priority < 100 so we forward before the generic webhook dispatch; we never
    // stop the chain, so other consumers are unaffected.
    this.hookManager.register('caawiye', 'message:received', ctx => this.onMessageReceived(ctx), 50);
    this.logger.log(`Caawiye inbound forwarder active -> ${this.config.get<string>('caawiye.webhookUrl')}`);
  }

  private isConfigured(): boolean {
    return (
      this.config.get<boolean>('caawiye.enabled', false) &&
      !!this.config.get<string>('caawiye.webhookUrl') &&
      !!this.config.get<string>('caawiye.webhookSecret')
    );
  }

  private async onMessageReceived(ctx: HookContext): Promise<HookResult> {
    const pass: HookResult = { continue: true, data: ctx.data };
    try {
      const msg = ctx.data as IncomingMessage | undefined;
      // Skip our own outbound echoes and group traffic (QR tier is 1:1 support).
      if (!msg || msg.fromMe || msg.isGroup) return pass;

      const session = ctx.sessionId
        ? await this.sessionRepository.findOne({ where: { id: ctx.sessionId } })
        : null;
      if (!session || !isCaawiyeSessionName(session.name)) return pass;

      await this.forward(session.name, msg);
    } catch (err) {
      this.logger.error('Failed to forward inbound message to Caawiye platform', String(err));
    }
    return pass;
  }

  private async forward(channelName: string, msg: IncomingMessage): Promise<void> {
    const url = this.config.get<string>('caawiye.webhookUrl')!;
    const secret = this.config.get<string>('caawiye.webhookSecret')!;
    const timeoutMs = this.config.get<number>('caawiye.webhookTimeoutMs', 10000);

    // The canonical WhatsApp address this message came from, in the neutral
    // dialect the engine emits: `<phone>@c.us` for a phone user, `<lid>@lid` for
    // a privacy id. Groups are already filtered out above, so `from` is the
    // customer. We forward it VERBATIM so the platform replies to the exact JID
    // (a LID stays a LID and is never rebuilt as a phone `@c.us`).
    const waAddress = msg.from;
    const body = JSON.stringify({
      channelName,
      // Full address to reply to verbatim (drives conversation keying on the platform).
      waAddress,
      // Back-compat for older platform builds that only read `externalUserId`.
      // Kept EQUAL to the full address so both fields agree (platform prefers `waAddress`).
      externalUserId: toExternalUserId(waAddress),
      externalMessageId: msg.id,
      content: msg.body ?? '',
      // whatsapp-web.js timestamps are epoch SECONDS; the platform expects ms.
      ts: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
    });
    const timestamp = Date.now().toString();
    const sig = this.signature.sign(body, timestamp, secret);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [CaawiyeSignatureService.TIMESTAMP_HEADER]: timestamp,
        [CaawiyeSignatureService.SIGNATURE_HEADER]: sig,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      this.logger.warn(`Caawiye webhook returned ${res.status} for ${channelName} msg ${msg.id}`);
    } else {
      this.logger.debug(`Forwarded inbound ${msg.id} for ${channelName} to Caawiye`);
    }
  }
}
