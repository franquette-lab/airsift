// src/test-crypto.ts
import { generateSecretRoom, encryptPayload, decryptPayload } from './crypto';

async function test() {
  console.log('--- Démarrage du test ---');
  
  const room = await generateSecretRoom('https://mon-domaine.com');
  console.log('1. Lien secret généré :', room.fullUrl);

  const liens = ['https://ycombinator.com', 'https://github.com'];
  const blocChiffre = await encryptPayload(liens, room.secretKey);
  console.log('2. Bloc chiffré (serveur) :', blocChiffre);

  const liensDechiffres = await decryptPayload<string[]>(blocChiffre, room.secretKey);
  console.log('3. Liens déchiffrés :', liensDechiffres);
}

test();
