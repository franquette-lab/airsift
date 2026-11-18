import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import os from 'node:os';

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
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
            currentRoomId = roomId;
            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Set());
            }
            rooms.get(roomId)?.add(ws);
            console.log(`[Relay] join room=${roomId} clients=${rooms.get(roomId)?.size ?? 0}`);
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
