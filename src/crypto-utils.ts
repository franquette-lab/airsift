import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from 'node:crypto';

function bufferToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// Dérivation HKDF-SHA256 -> Clé AES-256 (32 octets)
function deriveAesKey(masterKey: Uint8Array, salt: Uint8Array): Uint8Array {
  const info = new TextEncoder().encode('airsift-v1-aes256gcm');
  return hkdf(sha256, masterKey, salt, info, 32);
}

// Format final : [Salt 16o] + [Nonce 12o] + [Ciphertext] + [Tag GCM 16o]
export function encryptLocal(data: unknown, secretKeyBase64Url: string): string {
  const masterKey = base64UrlToBuffer(secretKeyBase64Url);
  const salt = new Uint8Array(randomBytes(16));
  const nonce = new Uint8Array(randomBytes(12));
  const aesKey = deriveAesKey(masterKey, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertextWithTag = gcm(aesKey, nonce).encrypt(plaintext);

  const combined = new Uint8Array(16 + 12 + ciphertextWithTag.length);
  combined.set(salt, 0);
  combined.set(nonce, 16);
  combined.set(ciphertextWithTag, 28);

  return bufferToBase64Url(combined);
}

export function decryptLocal<T = unknown>(encryptedBase64Url: string, secretKeyBase64Url: string): T {
  const masterKey = base64UrlToBuffer(secretKeyBase64Url);
  const combined = base64UrlToBuffer(encryptedBase64Url);

  if (combined.length < 44) {
    throw new Error('Paquet chiffré invalide ou tronqué');
  }

  const salt = combined.slice(0, 16);
  const nonce = combined.slice(16, 28);
  const ciphertextWithTag = combined.slice(28);

  const aesKey = deriveAesKey(masterKey, salt);
  const plaintext = gcm(aesKey, nonce).decrypt(ciphertextWithTag);

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
