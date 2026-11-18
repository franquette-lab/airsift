import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Clé secrète en mémoire pour signer les QR codes de cette session PC
const SERVER_HMAC_SECRET = randomBytes(32);

interface PairingPayload {
  room: string;
  key: string;
  expire: string;
  nonce: string;
}

// Nonces actifs : nonce -> timestamp d'expiration
const activeNonces = new Map<string, number>();

// Salles déjà appairées sur cette session (autorise le rechargement de la page mobile)
const pairedRooms = new Set<string>();

// Nettoyage automatique des nonces expirés toutes les minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, exp] of activeNonces.entries()) {
    if (now > exp) activeNonces.delete(nonce);
  }
}, 60_000);

function signPayload(data: string): string {
  return createHmac('sha256', SERVER_HMAC_SECRET)
    .update(data)
    .digest('base64url');
}

export function createSecurePairingUrl(
  baseUrl: string,
  roomId: string,
  secretKey: string,
  ttlMinutes = 5
): { url: string; expireAt: number } {
  const expireAt = Date.now() + ttlMinutes * 60_000;
  const nonce = randomBytes(16).toString('base64url');

  const payload: PairingPayload = {
    room: roomId,
    key: secretKey,
    expire: new Date(expireAt).toISOString(),
    nonce,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encodedPayload);

  activeNonces.set(nonce, expireAt);

  return {
    url: `${baseUrl}/#pair=${encodedPayload}.${signature}`,
    expireAt,
  };
}

export function verifyMobileJoin(
  roomId: string,
  pairingToken?: string | null
): { valid: boolean; reason?: string } {
  // Cas 1 : Premier scan du QR code (présence d'un jeton d'appairage)
  if (pairingToken) {
    const parts = pairingToken.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Format de jeton invalide' };
    }

    const [encodedPayload, receivedSig] = parts;
    const expectedSig = signPayload(encodedPayload);

    const sigBufA = Buffer.from(receivedSig);
    const sigBufB = Buffer.from(expectedSig);
    if (sigBufA.length !== sigBufB.length || !timingSafeEqual(sigBufA, sigBufB)) {
      return { valid: false, reason: 'Signature du QR code invalide' };
    }

    let payload: PairingPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      return { valid: false, reason: 'Contenu du jeton illisible' };
    }

    if (payload.room !== roomId) {
      return { valid: false, reason: 'Salle non concordante' };
    }

    if (Date.now() > new Date(payload.expire).getTime()) {
      activeNonces.delete(payload.nonce);
      return { valid: false, reason: 'QR Code expiré' };
    }

    if (!activeNonces.has(payload.nonce)) {
      return { valid: false, reason: 'QR Code déjà utilisé ou révoqué' };
    }

    // Consomme immédiatement le nonce (usage unique) et autorise la salle
    activeNonces.delete(payload.nonce);
    pairedRooms.add(roomId);
    return { valid: true };
  }

  // Cas 2 : Reconnexion / actualisation Safari d'un appareil déjà appairé
  if (pairedRooms.has(roomId)) {
    return { valid: true };
  }

  return { valid: false, reason: 'Appairage requis : scannez un nouveau QR Code' };
}
