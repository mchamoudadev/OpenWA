import * as crypto from 'crypto';
import { CaawiyeSignatureService } from './caawiye-signature.service';

/**
 * The gateway signer MUST produce exactly what the platform verifier
 * (`@caawiye/channels` `verifyWaWebhook`) recomputes: `sha256=` + hex HMAC over
 * `${timestamp}.${rawBody}`. This locks the byte-for-byte scheme so the two
 * repos cannot drift.
 */
describe('CaawiyeSignatureService', () => {
  const svc = new CaawiyeSignatureService();
  const secret = 'shared-secret';
  const body = JSON.stringify({ channelName: 'caw_x', content: 'hi' });
  const ts = '1700000000000';

  it('signs as sha256=<hex(hmac(secret, `${ts}.${body}`))>', () => {
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(svc.sign(body, ts, secret)).toBe(expected);
  });

  it('binds the timestamp into the signature (same body, different ts → different sig)', () => {
    expect(svc.sign(body, '1', secret)).not.toBe(svc.sign(body, '2', secret));
  });

  it('changes with the body (tamper is detectable)', () => {
    expect(svc.sign(body, ts, secret)).not.toBe(svc.sign(body.replace('hi', 'HACK'), ts, secret));
  });

  it('exposes the agreed header names', () => {
    expect(CaawiyeSignatureService.TIMESTAMP_HEADER).toBe('X-Caawiye-Timestamp');
    expect(CaawiyeSignatureService.SIGNATURE_HEADER).toBe('X-Caawiye-Signature');
  });
});
