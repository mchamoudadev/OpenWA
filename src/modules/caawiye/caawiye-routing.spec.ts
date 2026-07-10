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

  it('preserves the FULL WhatsApp address (never strips the domain suffix)', () => {
    // A phone user keeps @c.us; a privacy id keeps @lid (so it is never
    // mislabeled as a phone on reply); a group keeps @g.us; bare passes through.
    expect(toExternalUserId('252611234567@c.us')).toBe('252611234567@c.us');
    expect(toExternalUserId('170725637943366@lid')).toBe('170725637943366@lid');
    expect(toExternalUserId('252611234567')).toBe('252611234567');
    expect(toExternalUserId('120363@g.us')).toBe('120363@g.us');
  });
});
