// oxlint-disable eslint-plugin-unicorn/no-empty-file
// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('airsiftAPI', {
  getAllUrls: () => ipcRenderer.invoke('urls:getAll'),
  addUrl: (url: string, title?: string) => ipcRenderer.invoke('urls:add', url, title),
  updateUrlStatus: (id: number, status: string) => ipcRenderer.invoke('urls:updateStatus', id, status),
  deleteUrl: (id: number) => ipcRenderer.invoke('urls:delete', id),
  sendReadyUrlsBluetooth: (secretKey: string) => ipcRenderer.invoke('bluetooth:sendReadyUrls', secretKey),
  stopBluetooth: () => ipcRenderer.invoke('bluetooth:stop'),
});
