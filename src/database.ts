import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { generateSecretRoom } from './crypto';

export interface UrlItem {
  id: number;
  url: string;
  title: string;
  status: 'inbox' | 'to_send' | 'archive';
  room_id: string | null; // Identifie qui a envoyé le lien (null = ajouté localement sur le PC)
  created_at: string;
}

export interface RoomItem {
  id: number;
  name: string;        // Ex: "Mon iPhone", "Collègue Paul"
  room_id: string;     // Identifiant public de la salle sur Oracle Cloud
  secret_key: string;  // Clé AES-256 (jamais envoyée au serveur)
  full_url: string;    // Lien complet avec #clé pour QR Code ou partage
  created_at: string;
}

const dbPath = path.join(app.getPath('userData'), 'airsift.db');
const db = new Database(dbPath);

// 1. Création des tables
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'inbox',
    room_id TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room_id TEXT UNIQUE NOT NULL,
    secret_key TEXT NOT NULL,
    full_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 2. Migration douce pour votre base airsift.db existante (ajoute room_id si absent)
try {
  db.exec('ALTER TABLE urls ADD COLUMN room_id TEXT DEFAULT NULL');
} catch {
  // La colonne existe déjà, on ignore simplement
}

// 3. Repository des URLs (votre code existant enrichi avec room_id)
export const urlRepository = {
  getAll: (): UrlItem[] => {
    return db.prepare('SELECT * FROM urls ORDER BY created_at DESC').all() as UrlItem[];
  },
  add: (url: string, title = '', roomId: string | null = null): UrlItem => {
    const stmt = db.prepare('INSERT INTO urls (url, title, room_id) VALUES (?, ?, ?)');
    const info = stmt.run(url, title || url, roomId);
    return {
      id: Number(info.lastInsertRowid),
      url,
      title: title || url,
      status: 'inbox',
      room_id: roomId,
      created_at: new Date().toISOString()
    };
  },
  updateStatus: (id: number, status: UrlItem['status']): void => {
    db.prepare('UPDATE urls SET status = ? WHERE id = ?').run(status, id);
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM urls WHERE id = ?').run(id);
  }
};

// 4. Nouveau Repository pour vos salles / correspondants
export const roomRepository = {
  getAll: (): RoomItem[] => {
    return db.prepare('SELECT * FROM rooms ORDER BY id ASC').all() as RoomItem[];
  },
  getByRoomId: (roomId: string): RoomItem | undefined => {
    return db.prepare('SELECT * FROM rooms WHERE room_id = ?').get(roomId) as RoomItem | undefined;
  },
  create: async (name: string, serverBaseUrl: string): Promise<RoomItem> => {
    const credentials = await generateSecretRoom(serverBaseUrl);
    const stmt = db.prepare(`
      INSERT INTO rooms (name, room_id, secret_key, full_url)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(name, credentials.roomId, credentials.secretKey, credentials.fullUrl);
    
    return {
      id: Number(info.lastInsertRowid),
      name,
      room_id: credentials.roomId,
      secret_key: credentials.secretKey,
      full_url: credentials.fullUrl,
      created_at: new Date().toISOString()
    };
  },
  ensureDefaultRoom: async (serverBaseUrl: string): Promise<RoomItem> => {
    const existing = roomRepository.getAll();
    if (existing.length > 0) {
      return existing[0];
    }
    return await roomRepository.create('Mon iPhone', serverBaseUrl);
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  }
};
