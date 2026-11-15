import WebSocket from 'ws';
import { BrowserWindow, Notification } from 'electron';
import { encryptPayload, decryptPayload } from './crypto';
import { roomRepository, urlRepository, RoomItem, UrlItem } from './database';

// Remplacez par l'URL de votre relais sur Oracle Cloud (en wss:// si HTTPS est actif)
//const RELAY_WS_URL = 'wss://haresync.duckdns.org';
  const RELAY_WS_URL = 'ws://localhost:3000';
    
// Format standard des paquets échangés entre le PC et l'iPhone
export interface SharedPayload {
  items: Array<{
    url: string;
    title?: string;
  }>;
}

class CloudShareManager {
  // Stocke une connexion WebSocket active par roomId
  private connections = new Map<string, WebSocket>();
  private mainWindow: BrowserWindow | null = null;

  /**
   * Initialise les connexions WebSocket pour toutes les salles enregistrées au démarrage
   */
  public async init(win: BrowserWindow, serverHttpUrl: string): Promise<void> {
    this.mainWindow = win;

    // Crée la salle "Mon iPhone" par défaut si c'est le premier lancement
    await roomRepository.ensureDefaultRoom(serverHttpUrl);

    // Connecte chaque salle enregistrée
    const rooms = roomRepository.getAll();
    for (const room of rooms) {
      this.connectRoom(room);
    }
  }

  /**
   * Établit et maintient la connexion WebSocket d'une salle avec reconnexion automatique
   */
  public connectRoom(room: RoomItem): void {
    // Ferme une éventuelle ancienne connexion pour cette salle
    if (this.connections.has(room.room_id)) {
      this.connections.get(room.room_id)?.close();
    }

    const ws = new WebSocket(RELAY_WS_URL);

    ws.on('open', () => {
      // S'enregistre auprès du relais Oracle Cloud en tant que 'pc'
      ws.send(JSON.stringify({
        type: 'join',
        roomId: room.room_id,
        device: 'pc'
      }));
    });

    ws.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());

        // Réception d'un bloc chiffré depuis l'iPhone ou un correspondant
        if (message.type === 'encrypted_payload' && message.payload) {
          await this.handleIncomingPayload(room, message.payload);
        }
      } catch (error) {
        console.error(`[Airsift Cloud] Erreur de traitement sur la salle ${room.name}:`, error);
      }
    });

    ws.on('close', () => {
      this.connections.delete(room.room_id);
      // Tentative de reconnexion automatique toutes les 5 secondes en cas de coupure réseau
      setTimeout(() => {
        // Vérifie que la salle n'a pas été supprimée entre-temps
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

  /**
   * Déchiffre un bloc entrant, l'ajoute dans SQLite ("À trier") et rafraîchit l'interface
   */
  private async handleIncomingPayload(room: RoomItem, encryptedBlob: string): Promise<void> {
    const decrypted = await decryptPayload<SharedPayload>(encryptedBlob, room.secret_key);

    if (!decrypted || !Array.isArray(decrypted.items)) return;

    const addedItems: UrlItem[] = [];

    for (const item of decrypted.items) {
      if (item.url) {
        const saved = urlRepository.add(item.url, item.title || item.url, room.room_id);
        addedItems.push(saved);
      }
    }

    if (addedItems.length > 0) {
      // Notifie l'interface Kanban (React/HTML) pour afficher les nouveaux liens sans recharger
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('urls:received', addedItems);
        this.mainWindow.flashFrame(true); // Fait clignoter l'icône Windows
      }

      // Affiche une notification Windows native
      new Notification({
        title: `Airsift • Reçu de ${room.name}`,
        body: addedItems.length === 1 
          ? addedItems[0].title 
          : `${addedItems.length} nouveaux liens ajoutés à trier.`
      }).show();
    }
  }

  /**
   * Chiffre et envoie une liste de liens vers une salle précise (iPhone ou correspondant)
   */
  public async sendToRoom(roomId: string, urlsToSend: UrlItem[]): Promise<{ success: boolean; error?: string }> {
    const room = roomRepository.getByRoomId(roomId);
    if (!room) {
      return { success: false, error: 'Salle introuvable.' };
    }

    const ws = this.connections.get(roomId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Non connecté au serveur relais.' };
    }

    try {
      const payloadData: SharedPayload = {
        items: urlsToSend.map(u => ({ url: u.url, title: u.title }))
      };

      // Chiffrement local AES-256 avant de quitter le PC
      const encryptedBlob = await encryptPayload(payloadData, room.secret_key);

      ws.send(JSON.stringify({
        type: 'send',
        payload: encryptedBlob
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const cloudShare = new CloudShareManager();
