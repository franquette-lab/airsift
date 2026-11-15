import crypto from 'node:crypto';

export interface RoomCredentials {
  roomId: string;
  secretKey: string;
  fullUrl: string;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// Dérivation de flux symétrique (identique à la fonction sur iPhone)
function xorStream(data: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  let state = 0x9e3779b9;

  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key[i], 0x85ebca6b);
  for (let i = 0; i < nonce.length; i++) state = Math.imul(state ^ nonce[i], 0xc2b2ae35);

  for (let i = 0; i < data.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const keyByte = (state >>> ((i % 4) * 8)) & 0xff;
    const mixByte = key[i % key.length] ^ nonce[i % nonce.length];
    out[i] = data[i] ^ keyByte ^ mixByte;
  }
  return out;
}

export async function generateSecretRoom(baseUrl: string): Promise<RoomCredentials> {
  const roomId = toBase64Url(crypto.randomBytes(12));
  const secretKey = toBase64Url(crypto.randomBytes(32));
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const fullUrl = `${cleanBaseUrl}/?room=${roomId}#${secretKey}`;
  return { roomId, secretKey, fullUrl };
}

export async function encryptPayload(data: unknown, secretKeyBase64Url: string): Promise<string> {
  const key = fromBase64Url(secretKeyBase64Url);
  const nonce = new Uint8Array(crypto.randomBytes(16));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipher = xorStream(encoded, key, nonce);

  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce, 0);
  combined.set(cipher, nonce.length);
  return toBase64Url(combined);
}

export async function decryptPayload<T = unknown>(encryptedBase64Url: string, secretKeyBase64Url: string): Promise<T> {
  const key = fromBase64Url(secretKeyBase64Url);
  const combined = fromBase64Url(encryptedBase64Url);
  const nonce = combined.slice(0, 16);
  const cipher = combined.slice(16);

  const plainBytes = xorStream(cipher, key, nonce);
  const decodedText = new TextDecoder().decode(plainBytes);
  return JSON.parse(decodedText) as T;
}
