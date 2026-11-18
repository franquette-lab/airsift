import crypto from 'node:crypto';
import { encryptLocal, decryptLocal } from './crypto-utils';

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

export async function generateSecretRoom(baseUrl: string): Promise<RoomCredentials> {
  const roomId = toBase64Url(crypto.randomBytes(12));
  const secretKey = toBase64Url(crypto.randomBytes(32));
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const fullUrl = `${cleanBaseUrl}/?room=${roomId}#${secretKey}`;
  return { roomId, secretKey, fullUrl };
}

export async function encryptPayload(data: unknown, secretKeyBase64Url: string): Promise<string> {
  return encryptLocal(data, secretKeyBase64Url);
}

export async function decryptPayload<T = unknown>(
  encryptedBase64Url: string,
  secretKeyBase64Url: string,
): Promise<T> {
  return decryptLocal<T>(encryptedBase64Url, secretKeyBase64Url);
}
