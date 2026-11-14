import crypto from 'node:crypto';
import { UrlItem } from './database';

export interface EncryptedPayload {
  iv: string;        // Vecteur d'initialisation (hex)
  authTag: string;   // Tag d'intégrité GCM (hex)
  data: string;      // JSON chiffré (base64)
  timestamp: number;
}

/**
 * Chiffre la liste des URLs en JSON avec un mot de passe partagé (PIN ou clé secrète)
 */
export function encryptUrlsPayload(urls: UrlItem[], secretKey: string): EncryptedPayload {
  // Dérivation d'une clé de 32 octets (256 bits) à partir du mot de passe
  const key = crypto.scryptSync(secretKey, 'airsift-salt-2026', 32);
  const iv = crypto.randomBytes(12); // Recommandé pour GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const jsonString = JSON.stringify({
    app: 'Airsift',
    count: urls.length,
    items: urls.map((u) => ({ id: u.id, url: u.url, title: u.title })),
  });

  let encrypted = cipher.update(jsonString, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    authTag,
    data: encrypted,
    timestamp: Date.now(),
  };
}
