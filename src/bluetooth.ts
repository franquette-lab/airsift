import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { EncryptedPayload } from './crypto';

let bleProcess: ChildProcess | null = null;

export function startBluetoothBroadcast(payload: EncryptedPayload): Promise<string> {
  return new Promise((resolve, reject) => {
    stopBluetoothBroadcast();

    const jsonStr = JSON.stringify(payload);
    // Chemin vers le script PowerShell dans le dossier src
    const scriptPath = path.join(process.cwd(), 'src', 'ble-server.ps1');

    bleProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-PayloadJson', jsonStr,
    ]);

    bleProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('READY')) {
        resolve(`Diffusion BLE native active (${Buffer.byteLength(jsonStr, 'utf8')} octets chiffrés)`);
      }
    });

    bleProcess.stderr?.on('data', (data) => {
      reject(new Error(`Erreur Bluetooth Windows : ${data.toString()}`));
    });

    bleProcess.on('error', (err) => {
      reject(err);
    });
  });
}

export function stopBluetoothBroadcast() {
  if (bleProcess) {
    bleProcess.kill();
    bleProcess = null;
  }
}
