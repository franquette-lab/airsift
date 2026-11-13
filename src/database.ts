import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

export interface UrlItem {
  id: number;
  url: string;
  title: string;
  status: 'inbox' | 'to_send' | 'archive';
  created_at: string;
}

const dbPath = path.join(app.getPath('userData'), 'airsift.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'inbox',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export const urlRepository = {
  getAll: (): UrlItem[] => {
    return db.prepare('SELECT * FROM urls ORDER BY created_at DESC').all() as UrlItem[];
  },
  add: (url: string, title = ''): UrlItem => {
    const stmt = db.prepare('INSERT INTO urls (url, title) VALUES (?, ?)');
    const info = stmt.run(url, title || url);
    return { id: Number(info.lastInsertRowid), url, title: title || url, status: 'inbox', created_at: new Date().toISOString() };
  },
  updateStatus: (id: number, status: UrlItem['status']): void => {
    db.prepare('UPDATE urls SET status = ? WHERE id = ?').run(status, id);
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM urls WHERE id = ?').run(id);
  }
};
