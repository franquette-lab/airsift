import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { urlRepository, roomRepository, UrlItem } from './database';
import { cloudShare } from './cloud-share';
import { startLocalRelay } from './local-relay';
import { createSecurePairingUrl } from './pairing-token';
import { validateAndNormalizeUrl } from './url-validator';

if (started) {
  app.quit();
}

const createWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Ouvre les liens externes (target="_blank") dans le navigateur par défaut (Chrome, Edge, etc.)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.webContents.openDevTools();
  return mainWindow;
};

app.whenReady().then(async () => {
  // Déclare le nom de l'application auprès de Windows pour autoriser les notifications natives
  app.setAppUserModelId('Airsift');

  // 1. Démarrage unique du serveur relais local sécurisé TLS sur le Wi-Fi (port 3443)
  const localHttpsUrl = await startLocalRelay(3443, app.getPath('userData'));
  console.log('[Airsift] Relais Wi-Fi TLS démarré sur :', localHttpsUrl);

  // 2. Canaux IPC pour SQLite (URLs)
  ipcMain.handle('urls:getAll', () => urlRepository.getAll());
  ipcMain.handle('urls:add', (_, url: string, title?: string) => {
    const safeUrl = validateAndNormalizeUrl(url);
    return urlRepository.add(safeUrl, title);
  });
  ipcMain.handle('urls:updateStatus', (_, id: number, status: UrlItem['status']) => urlRepository.updateStatus(id, status));
  ipcMain.handle('urls:delete', (_, id: number) => urlRepository.delete(id));

  // 3. Canaux IPC pour gérer les salles / correspondants avec l'adresse HTTPS locale
  ipcMain.handle('rooms:getAll', () => roomRepository.getAll());
  ipcMain.handle('rooms:create', async (_, name: string) => {
    const newRoom = await roomRepository.create(name, localHttpsUrl);
    cloudShare.connectRoom(newRoom);
    return newRoom;
  });
  ipcMain.handle('rooms:delete', (_, id: number) => roomRepository.delete(id));
  ipcMain.handle('rooms:createPairingUrl', (_, roomId: string, secretKey: string) => {
    return createSecurePairingUrl(localHttpsUrl, roomId, secretKey, 5); // Expire dans 5 min
  });

  // 4. Canal IPC pour envoyer la colonne "Prêt à envoyer" vers le relais local
  ipcMain.handle('cloud:sendReadyUrls', async (_, roomId: string) => {
    const allUrls = urlRepository.getAll();
    const readyUrls = allUrls.filter((u) => u.status === 'to_send');

    if (readyUrls.length === 0) {
      throw new Error('Aucun lien dans la colonne "Prêt à envoyer".');
    }

    const result = await cloudShare.sendToRoom(roomId, readyUrls);

    // Si l'envoi a réussi, on déplace automatiquement les liens vers la colonne "Envoyé"
    if (result.success) {
      for (const item of readyUrls) {
        urlRepository.updateStatus(item.id, 'sent');
      }
    }

    return result;
  });

  // 5. Création de la fenêtre et connexion du PC au relais local TLS
  const mainWindow = createWindow();
  await cloudShare.init(mainWindow, localHttpsUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
