import http from 'node:http';
import os from 'node:os';
import { Bonjour } from 'bonjour-service';
import { EncryptedPayload } from './crypto';
import fs from 'node:fs';
import path from 'node:path';


let server: http.Server | null = null;
let bonjourInstance: Bonjour | null = null;
const PORT = 8765;

// Récupère l'adresse IPv4 Wi-Fi / Ethernet locale du PC
function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function buildMobileHtml(payload: EncryptedPayload): string {
    // Lecture locale de crypto-js depuis node_modules (fonctionne même sans Internet)
    let cryptoJsCode = '';
    try {
      const cryptoPath = path.join(process.cwd(), 'node_modules', 'crypto-js', 'crypto-js.js');
      cryptoJsCode = fs.readFileSync(cryptoPath, 'utf8');
    } catch (e) {
      cryptoJsCode = 'console.error("crypto-js introuvable localement");';
    }
  
    return `<!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Airsift - Réception Wi-Fi</title>
    <script>${cryptoJsCode}</script>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 500px; margin: 0 auto; background: #f5f7fa; color: #1a1a1a; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-top: 16px; }
      input { width: 100%; box-sizing: border-box; padding: 12px; font-size: 18px; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 12px; }
      button { width: 100%; padding: 14px; font-size: 16px; font-weight: bold; background: #1976d2; color: white; border: none; border-radius: 8px; cursor: pointer; }
      ul { list-style: none; padding: 0; margin: 0; }
      li { padding: 12px 0; border-bottom: 1px solid #eee; word-break: break-all; }
      li:last-child { border-bottom: none; }
      a { color: #1976d2; text-decoration: none; font-weight: 500; font-size: 16px; }
      .error { color: #d32f2f; margin-top: 10px; font-weight: bold; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>📡 Airsift</h1>
    <p>Entrez votre code PIN pour déchiffrer vos liens reçus par Wi-Fi.</p>
    <div class="card" id="authBox">
      <input type="password" id="pin" placeholder="Code PIN (ex: 1234)" />
      <button onclick="decrypt()">Déverrouiller les liens</button>
      <div id="err" class="error"></div>
    </div>
    <div class="card" id="resultBox" style="display:none;">
      <ul id="urlList"></ul>
    </div>
  
    <script>
      const PAYLOAD = ${JSON.stringify(payload)};
  
      function decrypt() {
        const pin = document.getElementById('pin').value.trim();
        const errDiv = document.getElementById('err');
        errDiv.textContent = '';
  
        try {
          if (typeof CryptoJS === 'undefined') {
            throw new Error('CryptoJS non chargé.');
          }
          if (!PAYLOAD || !PAYLOAD.data) {
            throw new Error('Payload vide : ' + JSON.stringify(PAYLOAD));
          }
  
          const bytes = CryptoJS.AES.decrypt(PAYLOAD.data, pin);
          const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
          
          if (!decryptedText) {
            throw new Error('Déchiffrement vide (vérifiez le PIN).');
          }
  
          const json = JSON.parse(decryptedText);
  
          const list = document.getElementById('urlList');
          list.innerHTML = '';
          json.items.forEach(item => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = item.url;
            a.target = '_blank';
            a.textContent = item.url;
            li.appendChild(a);
            list.appendChild(li);
          });
  
          document.getElementById('authBox').style.display = 'none';
          document.getElementById('resultBox').style.display = 'block';
        } catch (e) {
          errDiv.textContent = 'Erreur : ' + e.message;
        }
      }
    </script>
  </body>
  </html>`;
  }
  
export function startWifiShare(payload: EncryptedPayload): Promise<string> {
  return new Promise((resolve, reject) => {
    stopWifiShare();

    const htmlPage = buildMobileHtml(payload);

    server = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlPage);
      }
    });

    server.on('error', (err) => reject(err));

    server.listen(PORT, '0.0.0.0', () => {
      bonjourInstance = new Bonjour();
      bonjourInstance.publish({
        name: 'Airsift',
        type: 'http',
        port: PORT,
        host: 'airsift.local',
      });

      const localIp = getLocalIpAddress();
      resolve(`Partage Wi-Fi actif : ouvrez http://airsift.local:${PORT} (ou http://${localIp}:${PORT}) sur votre iPhone`);
    });
  });
}

export function stopWifiShare() {
  if (bonjourInstance) {
    bonjourInstance.unpublishAll();
    bonjourInstance.destroy();
    bonjourInstance = null;
  }
  if (server) {
    server.close();
    server = null;
  }
}
