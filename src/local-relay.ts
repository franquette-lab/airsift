import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import os from 'node:os';

// Récupère automatiquement l'adresse IP locale de votre PC sur le Wi-Fi maison
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

    // Sert la page web mobile (public/index.html) pour votre iPhone
    app.use(express.static(path.join(process.cwd(), 'public')));

    const rooms = new Map<string, Set<any>>();

    wss.on('connection', (ws) => {
        let currentRoomId: string | null = null;
  
        ws.on('message', (rawMessage) => {
          try {
            const data = JSON.parse(rawMessage.toString());
  
            if (data.type === 'join' && typeof data.roomId === 'string') {
              const roomId: string = data.roomId;
              currentRoomId = roomId;
              if (!rooms.has(roomId)) {
                rooms.set(roomId, new Set());
              }
              rooms.get(roomId)?.add(ws);
            }
          if (data.type === 'send' && currentRoomId && typeof data.payload === 'string') {
            const clients = rooms.get(currentRoomId);
            if (clients) {
              clients.forEach((client) => {
                if (client !== ws && client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'encrypted_payload',
                    roomId: currentRoomId,
                    payload: data.payload,
                  }));
                }
              });
            }
          }
        } catch {
          // Ignore les messages invalides
        }
      });

      ws.on('close', () => {
        if (currentRoomId && rooms.has(currentRoomId)) {
          rooms.get(currentRoomId)!.delete(ws);
        }
      });
    });

    server.listen(port, '0.0.0.0', () => {
      const ip = getLocalIpAddress();
      resolve(`http://${ip}:${port}`);
    });
  });
}
