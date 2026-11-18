import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';

export interface TlsCredentials {
  key: string;
  cert: string;
}

export async function getOrCreateLocalCert(
  storageDir: string,
  localIp: string
): Promise<TlsCredentials> {
  const certFile = path.join(storageDir, 'airsift-local-cert.json');

  // Réutilise le certificat existant s'il a été généré pour la même IP locale
  if (fs.existsSync(certFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(certFile, 'utf8'));
      if (saved.ip === localIp && saved.key && saved.cert) {
        return { key: saved.key, cert: saved.cert };
      }
    } catch {
      // Régénère en cas de fichier corrompu
    }
  }

  const attrs = [{ name: 'commonName', value: localIp }];
  const options: any = {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: localIp },
          { type: 7, ip: '127.0.0.1' },
          { type: 2, value: 'localhost' },
        ],
      },
    ],
  };

  // Supporte à la fois selfsigned v2 (synchrone) et v3+ (asynchrone)
  const pems = await Promise.resolve((selfsigned as any).generate(attrs, options));

  const credentials: TlsCredentials = {
    key: pems.private,
    cert: pems.cert,
  };

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(certFile, JSON.stringify({ ip: localIp, ...credentials }), 'utf8');

  return credentials;
}
