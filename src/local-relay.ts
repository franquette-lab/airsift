import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import os from 'node:os';
import { verifyMobileJoin } from './pairing-token';

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  let fallbackIp = 'localhost';

  for (const name of Object.keys(interfaces)) {
    if (/wsl|vethernet|docker|vmware|virtualbox|loopback/i.test(name)) {
      continue;
    }
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.')) {
          return iface.address;
        }
        fallbackIp = iface.address;
      }
    }
  }
  return fallbackIp;
}

export function startLocalRelay(port = 3000): Promise<string> {
  return new Promise((resolve) => {
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    app.use(express.static(path.join(process.cwd(), 'public')));

    const rooms = new Map<string, Set<any>>();

    wss.on('connection', (ws) => {
      let currentRoomId: string | null = null;

      ws.on('message', (rawMessage) => {
        try {
          const data = JSON.parse(rawMessage.toString());
          const roomId = typeof data.roomId === 'string'
            ? data.roomId
            : (typeof data.room === 'string' ? data.room : null);

          if (data.type === 'join' && roomId) {
            // Vérification de sécurité si c'est un appareil mobile qui rejoint
            if (data.device === 'mobile') {
              const check = verifyMobileJoin(roomId, data.pairingToken);
              if (!check.valid) {
                console.warn(`[Relay] join mobile refuse room=${roomId} raison="${check.reason}"`);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: check.reason || 'QR Code invalide ou expiré',
                }));
                ws.close();
                return;
              }
            }

            currentRoomId = roomId;
            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Set());
            }
            rooms.get(roomId)?.add(ws);
            console.log(`[Relay] join room=${roomId} device=${data.device || 'pc'} clients=${rooms.get(roomId)?.size ?? 0}`);
            return;
          }

          if ((data.type === 'send' || data.type === 'link') && typeof data.payload === 'string') {
            if (!currentRoomId) {
              console.error('[Relay] send ignore: client non inscrit (join manquant)');
              return;
            }

            const clients = rooms.get(currentRoomId);
            if (!clients || clients.size === 0) {
              console.error(`[Relay] send ignore: salle introuvable room=${currentRoomId}`);
              return;
            }

            let forwarded = 0;
            clients.forEach((client) => {
              if (client !== ws && client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'encrypted_payload',
                  roomId: currentRoomId,
                  payload: data.payload,
                }));
                forwarded += 1;
              }
            });

            if (forwarded === 0) {
              console.error(`[Relay] send sans destinataire room=${currentRoomId} clients=${clients.size}`);
            } else {
              console.log(`[Relay] encrypted_payload relaye room=${currentRoomId} destinataires=${forwarded}`);
            }
            return;
          }

          console.warn('[Relay] message ignore:', data.type);
        } catch (error) {
          console.error('[Relay] JSON WebSocket invalide:', error);
        }
      });

      ws.on('close', () => {
        if (currentRoomId && rooms.has(currentRoomId)) {
          rooms.get(currentRoomId)!.delete(ws);
          console.log(`[Relay] close room=${currentRoomId} clients=${rooms.get(currentRoomId)?.size ?? 0}`);
        }
      });
    });

    server.listen(port, '0.0.0.0', () => {
      const ip = getLocalIpAddress();
      resolve(`http://${ip}:${port}`);
    });
  });
}
