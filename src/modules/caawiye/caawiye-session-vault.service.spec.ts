import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CaawiyeSessionVaultService } from './caawiye-session-vault.service';

/** Minimal ConfigService stub returning a fixed WA_SESSION_KEY. */
function vaultWithKey(key: string | undefined): CaawiyeSessionVaultService {
  const config = {
    get: (k: string) => (k === 'caawiye.sessionKey' ? key : undefined),
  } as unknown as ConfigService;
  return new CaawiyeSessionVaultService(config);
}

// A recognisable plaintext marker that would appear in a real WhatsApp session
// (LocalAuth stores tokens/keys); the acceptance test greps for it in the blob.
const PLAINTEXT_MARKER = 'WABrowserId=SECRET_SESSION_TOKEN_1234567890';

describe('CaawiyeSessionVaultService — byte primitives', () => {
  const vault = vaultWithKey('a'.repeat(64)); // 64 hex → raw 32-byte key

  it('is enabled only when a key is configured', () => {
    expect(vaultWithKey(undefined).isEnabled()).toBe(false);
    expect(vault.isEnabled()).toBe(true);
  });

  it('seals to ciphertext that does NOT contain the plaintext marker, and round-trips', () => {
    const plain = Buffer.from(`prefix ${PLAINTEXT_MARKER} suffix`, 'utf8');
    const blob = vault.sealBytes(plain);

    // AC: stored bytes are not plaintext.
    expect(blob.toString('utf8')).not.toContain(PLAINTEXT_MARKER);
    expect(blob.toString('latin1')).not.toContain(PLAINTEXT_MARKER);
    // AC: decrypt round-trip works.
    expect(vault.unsealBytes(blob).equals(plain)).toBe(true);
  });

  it('fails to decrypt a tampered blob (GCM auth tag)', () => {
    const blob = vault.sealBytes(Buffer.from('hello'));
    blob[blob.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => vault.unsealBytes(blob)).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const blob = vaultWithKey('a'.repeat(64)).sealBytes(Buffer.from('hello'));
    expect(() => vaultWithKey('b'.repeat(64)).unsealBytes(blob)).toThrow();
  });
});

describe('CaawiyeSessionVaultService — directory seal/unseal', () => {
  const vault = vaultWithKey('deadbeef'.repeat(8)); // 64 hex
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caawiye-vault-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('seals a session directory to an .enc blob with no plaintext, then unseals it back', async () => {
    // Simulate a LocalAuth session directory with nested files.
    const sessionDir = path.join(tmp, 'session-caw_test');
    fs.mkdirSync(path.join(sessionDir, 'Default', 'Local Storage'), { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'creds.json'), PLAINTEXT_MARKER);
    fs.writeFileSync(path.join(sessionDir, 'Default', 'Local Storage', 'leveldb.log'), 'more-secret-bytes');

    const encPath = await vault.sealDirectory(sessionDir);
    expect(encPath).toBe(sessionDir + '.session.enc');

    // Plaintext directory is gone; the blob does NOT contain the marker.
    expect(fs.existsSync(sessionDir)).toBe(false);
    expect(fs.existsSync(encPath!)).toBe(true);
    expect(fs.readFileSync(encPath!).toString('latin1')).not.toContain(PLAINTEXT_MARKER);

    // Unseal restores the exact tree + contents; the blob is removed.
    const restored = await vault.unsealDirectory(sessionDir);
    expect(restored).toBe(true);
    expect(fs.readFileSync(path.join(sessionDir, 'creds.json'), 'utf8')).toBe(PLAINTEXT_MARKER);
    expect(
      fs.readFileSync(path.join(sessionDir, 'Default', 'Local Storage', 'leveldb.log'), 'utf8'),
    ).toBe('more-secret-bytes');
    expect(fs.existsSync(encPath!)).toBe(false);
  });

  it('is a no-op when the vault is disabled (no WA_SESSION_KEY)', async () => {
    const disabled = vaultWithKey(undefined);
    const sessionDir = path.join(tmp, 'session-x');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'creds.json'), PLAINTEXT_MARKER);

    expect(await disabled.sealDirectory(sessionDir)).toBeNull();
    expect(fs.existsSync(sessionDir)).toBe(true); // untouched
  });
});
