"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretBox = void 0;
const crypto_1 = require("crypto");
class SecretBox {
    static deriveKey(secret) {
        return (0, crypto_1.createHash)('sha256').update(secret).digest();
    }
    static encrypt(plain, secret) {
        const key = this.deriveKey(secret);
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key, iv);
        const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v1:${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
    }
    static decrypt(box, secret) {
        const [v, ivB64, cipherB64, tagB64] = box.split(':');
        if (v !== 'v1' || !ivB64 || !cipherB64 || !tagB64) {
            throw new Error('Invalid secret box format');
        }
        const key = this.deriveKey(secret);
        const iv = Buffer.from(ivB64, 'base64');
        const ciphertext = Buffer.from(cipherB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plain.toString('utf8');
    }
}
exports.SecretBox = SecretBox;
//# sourceMappingURL=secret-box.js.map