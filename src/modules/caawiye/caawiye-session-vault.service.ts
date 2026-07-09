import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar-stream';
import { createLogger } from '../../common/services/logger.service';

/**
 * Session-at-rest encryption (P3-T1).
 *
 * whatsapp-web.js `LocalAuth` persists WhatsApp credentials as PLAINTEXT under
 * `<sessionDataPath>/session-<clientId>/` (a Chromium user-data dir). A disk
 * snapshot or backup would expose live session tokens. This vault seals that
 * directory into a single AES-256-GCM blob keyed from `WA_SESSION_KEY`, so at
 * rest the bytes are ciphertext, and unseals it on demand (before the engine
 * boots) so a restart needs no re-scan.
 *
 * Blob layout:  magic(4) | version(1) | iv(12) | authTag(16) | ciphertext(...)
 * Key:          scrypt(WA_SESSION_KEY, "caawiye-wa-session-v1", 32)  — or, when
 *               WA_SESSION_KEY is exactly 64 hex chars, those raw 32 bytes.
 *
 * The vault is INERT when `WA_SESSION_KEY` is unset (`isEnabled() === false`), so
 * the stock fork behaviour is preserved unless a Caawiye deploy opts in.
 */
@Injectable()
export class CaawiyeSessionVaultService {
  private readonly logger = createLogger('CaawiyeSessionVault');
  private static readonly MAGIC = Buffer.from('CAWV');
  private static readonly VERSION = 1;
  private static readonly ENC_SUFFIX = '.session.enc';

  constructor(private readonly config: ConfigService) {}

  private get secret(): string | undefined {
    return this.config.get<string>('caawiye.sessionKey');
  }

  /** True when a `WA_SESSION_KEY` is configured. */
  isEnabled(): boolean {
    return !!this.secret;
  }

  /** Derive the 32-byte AES key from the configured secret. */
  private deriveKey(): Buffer {
    const secret = this.secret;
    if (!secret) throw new Error('WA_SESSION_KEY is not configured');
    if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
    return crypto.scryptSync(secret, 'caawiye-wa-session-v1', 32);
  }

  // ---- byte-level primitives (unit-testable in isolation) ------------------

  /** Encrypt a buffer → `magic|version|iv|tag|ciphertext`. */
  sealBytes(plain: Buffer): Buffer {
    const key = this.deriveKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([
      CaawiyeSessionVaultService.MAGIC,
      Buffer.from([CaawiyeSessionVaultService.VERSION]),
      iv,
      tag,
      ciphertext,
    ]);
  }

  /** Decrypt a `sealBytes` blob back to plaintext (throws on tamper/wrong key). */
  unsealBytes(blob: Buffer): Buffer {
    const magic = blob.subarray(0, 4);
    if (!magic.equals(CaawiyeSessionVaultService.MAGIC)) {
      throw new Error('not a Caawiye session vault blob (bad magic)');
    }
    const iv = blob.subarray(5, 17);
    const tag = blob.subarray(17, 33);
    const ciphertext = blob.subarray(33);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // ---- directory-level operations ------------------------------------------

  /** Path of the sealed blob for a session directory. */
  encPathFor(sessionDir: string): string {
    return sessionDir + CaawiyeSessionVaultService.ENC_SUFFIX;
  }

  /**
   * Seal a session directory into its `.session.enc` blob and remove the
   * plaintext directory. No-op when the directory does not exist. Returns the
   * blob path (or null when the vault is disabled / dir missing).
   */
  async sealDirectory(sessionDir: string): Promise<string | null> {
    if (!this.isEnabled()) return null;
    if (!fs.existsSync(sessionDir)) return null;

    const archive = await packDirectory(sessionDir);
    const blob = this.sealBytes(archive);
    const encPath = this.encPathFor(sessionDir);
    await fs.promises.writeFile(encPath, blob);
    await fs.promises.rm(sessionDir, { recursive: true, force: true, maxRetries: 4 });
    this.logger.log(`Sealed session at rest: ${path.basename(sessionDir)} (${blob.length} bytes)`);
    return encPath;
  }

  /**
   * Unseal a session directory from its `.session.enc` blob (if present) so the
   * engine can reuse the credentials without a re-scan. No-op when no blob
   * exists or the vault is disabled. Removes the blob after a successful extract.
   */
  async unsealDirectory(sessionDir: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const encPath = this.encPathFor(sessionDir);
    if (!fs.existsSync(encPath)) return false;
    // Already unsealed (both exist) — trust the live dir, drop the stale blob.
    if (fs.existsSync(sessionDir)) {
      await fs.promises.rm(encPath, { force: true });
      return false;
    }

    const blob = await fs.promises.readFile(encPath);
    const archive = this.unsealBytes(blob);
    await unpackDirectory(archive, sessionDir);
    await fs.promises.rm(encPath, { force: true });
    this.logger.log(`Unsealed session for reuse: ${path.basename(sessionDir)}`);
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/* tar helpers (in-memory; sessions are small key stores, not media)          */
/* -------------------------------------------------------------------------- */

/** Recursively list files under `root`, returning paths relative to `root`. */
function listFiles(root: string, rel = ''): string[] {
  const out: string[] = [];
  const dir = path.join(root, rel);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(root, childRel));
    } else if (entry.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

/** Pack a directory tree into a tar buffer. */
function packDirectory(root: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const chunks: Buffer[] = [];
    pack.on('data', (c: Buffer) => chunks.push(c));
    pack.on('error', reject);
    pack.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      for (const relPath of listFiles(root)) {
        const content = fs.readFileSync(path.join(root, relPath));
        // Normalise to forward slashes so archives are portable across OSes.
        pack.entry({ name: relPath.split(path.sep).join('/') }, content);
      }
      pack.finalize();
    } catch (err) {
      reject(err as Error);
    }
  });
}

/** Extract a tar buffer into `destRoot`, creating directories as needed. */
function unpackDirectory(archive: Buffer, destRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    extract.on('entry', (header, stream, next) => {
      const dest = path.join(destRoot, header.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        fs.writeFileSync(dest, Buffer.concat(chunks));
        next();
      });
      stream.on('error', reject);
      stream.resume();
    });
    extract.on('finish', () => resolve());
    extract.on('error', reject);
    extract.end(archive);
  });
}
