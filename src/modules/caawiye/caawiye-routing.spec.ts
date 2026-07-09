import { isCaawiyeSessionName, toExternalUserId } from './caawiye-routing';

describe('caawiye-routing', () => {
  it('recognises a well-formed Caawiye session name', () => {
    const name = `caw_${'a'.repeat(32)}_${'b'.repeat(32)}`;
    expect(isCaawiyeSessionName(name)).toBe(true);
  });

  it('rejects non-Caawiye / malformed names', () => {
    expect(isCaawiyeSessionName('my-session')).toBe(false);
    expect(isCaawiyeSessionName('caw_short_short')).toBe(false);
    expect(isCaawiyeSessionName(`caw_${'a'.repeat(32)}`)).toBe(false); // one segment
    expect(isCaawiyeSessionName(null)).toBe(false);
    expect(isCaawiyeSessionName(undefined)).toBe(false);
  });

  it('strips the WhatsApp chat suffix to the bare MSISDN', () => {
    expect(toExternalUserId('252611234567@c.us')).toBe('252611234567');
    expect(toExternalUserId('252611234567')).toBe('252611234567');
    expect(toExternalUserId('120363@g.us')).toBe('120363');
  });
});
