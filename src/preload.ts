import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('airsiftAPI', {
  // Gestion des URLs
  getAllUrls: () => ipcRenderer.invoke('urls:getAll'),
  addUrl: (url: string, title?: string) => ipcRenderer.invoke('urls:add', url, title),
  updateUrlStatus: (id: number, status: string) => ipcRenderer.invoke('urls:updateStatus', id, status),
  deleteUrl: (id: number) => ipcRenderer.invoke('urls:delete', id),

  // Gestion des salles / correspondants
  getAllRooms: () => ipcRenderer.invoke('rooms:getAll'),
  createRoom: (name: string) => ipcRenderer.invoke('rooms:create', name),
  deleteRoom: (id: number) => ipcRenderer.invoke('rooms:delete', id),

  // Envoi chiffré vers le relais Oracle Cloud
  sendReadyUrlsCloud: (roomId: string) => ipcRenderer.invoke('cloud:sendReadyUrls', roomId),

  // Écouteur temps réel quand un lien arrive depuis l'iPhone
  onUrlsReceived: (callback: (newItems: any[]) => void) => {
    const listener = (_event: any, items: any[]) => callback(items);
    ipcRenderer.on('urls:received', listener);
    return () => ipcRenderer.removeListener('urls:received', listener);
  },
});
