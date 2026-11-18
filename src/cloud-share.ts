import WebSocket from 'ws';
import { BrowserWindow, Notification } from 'electron';
import { roomRepository, urlRepository, RoomItem, UrlItem } from './database';
import { encryptLocal, decryptLocal } from './crypto-utils';
import { validateAndNormalizeUrl } from './url-validator';

export interface SharedPayload {
  items: Array<{
    url: string;
    title?: string;
  }>;
}

class CloudShareManager {
  private connections = new Map<string, WebSocket>();
  private mainWindow: BrowserWindow | null = null;
  private relayWsUrl = 'wss://127.0.0.1:3443';

  public async init(win: BrowserWindow, serverHttpUrl: string): Promise<void> {
    this.mainWindow = win;

    // Convertit http(s)://192.168.1.20:3443 en ws(s)://192.168.1.20:3443
    this.relayWsUrl = serverHttpUrl.replace(/^http/i, 'ws');

    await roomRepository.ensureDefaultRoom(serverHttpUrl);

    const rooms = roomRepository.getAll();
    for (const room of rooms) {
      this.connectRoom(room);
    }
  }

  public connectRoom(room: RoomItem): void {
    const previous = this.connections.get(room.room_id);
    if (previous) {
      previous.close();
    }

    // Autorise le certificat auto-signé local du relais TLS
    const ws = new WebSocket(this.relayWsUrl, {
      rejectUnauthorized: false,
    });

    ws.on('open', () => {
      console.log(`[Airsift Cloud] Join salle "${room.name}" (${room.room_id})`);
      ws.send(JSON.stringify({
        type: 'join',
        roomId: room.room_id,
        device: 'pc',
      }));
    });

    ws.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());

        if (message.type === 'encrypted_payload' && typeof message.payload === 'string') {
          await this.handleIncomingPayload(room, message.payload);
          return;
        }

        console.warn(`[Airsift Cloud] Message ignore (salle ${room.name}):`, message.type);
      } catch (error) {
        console.error(`[Airsift Cloud] Erreur de traitement sur la salle ${room.name}:`, error);
      }
    });

    ws.on('close', () => {
      if (this.connections.get(room.room_id) !== ws) {
        return;
      }

      this.connections.delete(room.room_id);
      console.warn(`[Airsift Cloud] WebSocket ferme pour "${room.name}", reconnexion dans 5s`);

      setTimeout(() => {
        if (this.connections.has(room.room_id)) return;
        const stillExists = roomRepository.getByRoomId(room.room_id);
        if (stillExists) {
          this.connectRoom(stillExists);
        }
      }, 5000);
    });

    ws.on('error', (err) => {
      console.error(`[Airsift Cloud] Erreur WebSocket (${room.name}):`, err.message);
    });

    this.connections.set(room.room_id, ws);
  }

  private async handleIncomingPayload(room: RoomItem, encryptedBlob: string): Promise<void> {
    let decrypted: SharedPayload;
    try {
      decrypted = decryptLocal<SharedPayload>(encryptedBlob, room.secret_key);
    } catch (error) {
      console.error(`[Airsift Cloud] Echec dechiffrement AES-GCM (salle ${room.name}):`, error);
      return;
    }

    if (!decrypted || !Array.isArray(decrypted.items)) {
      console.error(`[Airsift Cloud] Payload dechiffre invalide (salle ${room.name}): attendu { items: [...] }`, decrypted);
      return;
    }

    const addedItems: UrlItem[] = [];

    for (const item of decrypted.items) {
      if (item.url) {
        try {
          const safeUrl = validateAndNormalizeUrl(item.url);
          const saved = urlRepository.add(safeUrl, item.title || safeUrl, room.room_id);
          addedItems.push(saved);
        } catch (err: any) {
          console.warn(`[Airsift Cloud] URL mobile rejetee (${item.url}):`, err.message);
        }
      }
    }

    if (addedItems.length === 0) {
      console.warn(`[Airsift Cloud] Aucune URL valide dans le payload (salle ${room.name})`);
      return;
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('urls:received', addedItems);
      this.mainWindow.flashFrame(true);
    }

    new Notification({
      title: `Airsift • Recu de ${room.name}`,
      body: addedItems.length === 1
        ? addedItems[0].title
        : `${addedItems.length} nouveaux liens ajoutes a trier.`,
    }).show();
  }

  public async sendToRoom(roomId: string, urlsToSend: UrlItem[]): Promise<{ success: boolean; error?: string }> {
    const room = roomRepository.getByRoomId(roomId);
    if (!room) {
      return { success: false, error: 'Salle introuvable.' };
    }

    const ws = this.connections.get(roomId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error(`[Airsift Cloud] Envoi refuse: WebSocket non ouvert pour ${roomId} (state=${ws?.readyState})`);
      return { success: false, error: 'Non connecte au serveur relais.' };
    }

    try {
      const payloadData: SharedPayload = {
        items: urlsToSend.map((u) => ({ url: u.url, title: u.title })),
      };

      const encryptedBlob = encryptLocal(payloadData, room.secret_key);

      ws.send(JSON.stringify({
        type: 'send',
        payload: encryptedBlob,
      }));

      console.log(`[Airsift Cloud] Envoi de ${payloadData.items.length} lien(s) vers "${room.name}"`);
      return { success: true };
    } catch (err: any) {
      console.error(`[Airsift Cloud] Echec chiffrement/envoi (salle ${room.name}):`, err);
      return { success: false, error: err.message };
    }
  }
}

export const cloudShare = new CloudShareManager();
