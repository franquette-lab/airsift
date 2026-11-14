import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { urlRepository, UrlItem } from './database';
import { encryptUrlsPayload } from './crypto';
import { startWifiShare, stopWifiShare } from './wifi-share';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// Un seul bloc app.whenReady() pour éviter d'ouvrir 2 fenêtres
app.whenReady().then(() => {
  // Canaux IPC pour SQLite
  ipcMain.handle('urls:getAll', () => urlRepository.getAll());
  ipcMain.handle('urls:add', (_, url: string, title?: string) => urlRepository.add(url, title));
  ipcMain.handle('urls:updateStatus', (_, id: number, status: UrlItem['status']) => urlRepository.updateStatus(id, status));
  ipcMain.handle('urls:delete', (_, id: number) => urlRepository.delete(id));

  // Canaux IPC pour le chiffrement et le partage Wi-Fi local
  ipcMain.handle('bluetooth:sendReadyUrls', async (_, secretKey: string) => {
    const allUrls = urlRepository.getAll();
    const readyUrls = allUrls.filter((u) => u.status === 'to_send');
    
    if (readyUrls.length === 0) {
      throw new Error('Aucun lien dans la colonne "Prêt à envoyer".');
    }

    const encrypted = encryptUrlsPayload(readyUrls, secretKey);
    const statusMessage = await startWifiShare(encrypted);

    return { statusMessage, encryptedPreview: encrypted };
  });

  ipcMain.handle('bluetooth:stop', () => {
    stopWifiShare();
  });

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  stopWifiShare();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
