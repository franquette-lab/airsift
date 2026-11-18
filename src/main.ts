import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import { urlRepository, roomRepository, UrlItem } from './database';
import { cloudShare } from './cloud-share';
import { startLocalRelay } from './local-relay';

if (started) {
  app.quit();
}

// Détecte la véritable adresse IPv4 Wi-Fi/Ethernet en ignorant WSL, Docker, Hyper-V, etc.
function getLocalWifiIp(): string {
  const interfaces = os.networkInterfaces();
  let fallbackIp = '127.0.0.1';

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (/wsl|vethernet|docker|vmware|virtualbox|loopback/i.test(name)) {
      continue;
    }

    for (const addr of addresses || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        if (addr.address.startsWith('192.168.')) {
          return addr.address;
        }
        fallbackIp = addr.address;
      }
    }
  }
  return fallbackIp;
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

  // 1. Démarrage du serveur relais local sur le Wi-Fi maison (port 3000)
  const rawRelayUrl = await startLocalRelay(3000);
  const wifiIp = getLocalWifiIp();
  const parsedUrl = new URL(rawRelayUrl);
  parsedUrl.hostname = wifiIp;
  const localHttpUrl = parsedUrl.origin;

  console.log('[Airsift] Relais Wi-Fi démarré sur :', localHttpUrl);

  // 2. Canaux IPC pour SQLite (URLs)
  ipcMain.handle('urls:getAll', () => urlRepository.getAll());
  ipcMain.handle('urls:add', (_, url: string, title?: string) => urlRepository.add(url, title));
  ipcMain.handle('urls:updateStatus', (_, id: number, status: UrlItem['status']) => urlRepository.updateStatus(id, status));
  ipcMain.handle('urls:delete', (_, id: number) => urlRepository.delete(id));

  // 3. Canaux IPC pour gérer les salles / correspondants avec l'adresse locale
  ipcMain.handle('rooms:getAll', () => roomRepository.getAll());
  ipcMain.handle('rooms:create', async (_, name: string) => {
    const newRoom = await roomRepository.create(name, localHttpUrl);
    cloudShare.connectRoom(newRoom);
    return newRoom;
  });
  ipcMain.handle('rooms:delete', (_, id: number) => roomRepository.delete(id));

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

  // 5. Création de la fenêtre et connexion du PC au relais local
  const mainWindow = createWindow();
  await cloudShare.init(mainWindow, localHttpUrl);

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
