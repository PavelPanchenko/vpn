import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Simple AES-256-GCM secret box.
 * - Input/Output: base64 string "v1:<ivB64>:<cipherB64>:<tagB64>"
 */
export class SecretBox {
  private static deriveKey(secret: string) {
    return createHash('sha256').update(secret).digest(); // 32 bytes
  }

  static encrypt(plain: string, secret: string): string {
    const key = this.deriveKey(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
  }

  static decrypt(box: string, secret: string): string {
    const [v, ivB64, cipherB64, tagB64] = box.split(':');
    if (v !== 'v1' || !ivB64 || !cipherB64 || !tagB64) {
      throw new Error('Invalid secret box format');
    }
    const key = this.deriveKey(secret);
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(cipherB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  }
}

