import CryptoJS from 'crypto-js';
import { UrlItem } from './database';

export interface EncryptedPayload {
  data: string;
  timestamp: number;
}

export function encryptUrlsPayload(urls: UrlItem[], secretKey: string): EncryptedPayload {
  const jsonString = JSON.stringify({
    app: 'Airsift',
    count: urls.length,
    items: urls.map((u) => ({ id: u.id, url: u.url, title: u.title })),
  });

  const encrypted = CryptoJS.AES.encrypt(jsonString, secretKey).toString();

  return {
    data: encrypted,
    timestamp: Date.now(),
  };
}
