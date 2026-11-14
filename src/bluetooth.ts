// @ts-ignore - Les types officiels de @stoprocent/bleno sont parfois incomplets
import bleno from '@stoprocent/bleno';
import { EncryptedPayload } from './crypto';

const AIRSIFT_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const PAYLOAD_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';

let currentPayloadBuffer: Buffer = Buffer.from('{}', 'utf8');

class AirsiftCharacteristic extends bleno.Characteristic {
    constructor() {
      super({
        uuid: PAYLOAD_CHAR_UUID,
        properties: ['read', 'notify'],
        value: null,
      });
    }
  
    onReadRequest(_handle: any, offset: number, callback: (result: number, data?: Buffer) => void) {
      if (offset > currentPayloadBuffer.length) {
        callback(this.RESULT_INVALID_OFFSET);
      } else {
        callback(this.RESULT_SUCCESS, currentPayloadBuffer.subarray(offset));
      }
    }
  }
  

export function startBluetoothBroadcast(payload: EncryptedPayload): Promise<string> {
  return new Promise((resolve, reject) => {
    const jsonStr = JSON.stringify(payload);
    currentPayloadBuffer = Buffer.from(jsonStr, 'utf8');

    const characteristic = new AirsiftCharacteristic();
    const service = new bleno.PrimaryService({
      uuid: AIRSIFT_SERVICE_UUID,
      characteristics: [characteristic as any],
    });

    const startAdvertising = () => {
      bleno.startAdvertising('Airsift-PC', [AIRSIFT_SERVICE_UUID], (err?: Error | null) => {
        if (err) return reject(err);
        bleno.setServices([service], (serviceErr?: Error | null) => {
          if (serviceErr) return reject(serviceErr);
          resolve(`Diffusion Bluetooth active (${currentPayloadBuffer.length} octets chiffrés)`);
        });
      });
    };

    if (bleno.state === 'poweredOn') {
      startAdvertising();
    } else {
      bleno.once('stateChange', (state: string) => {
        if (state === 'poweredOn') {
          startAdvertising();
        } else {
          reject(new Error(`Adaptateur Bluetooth non prêt : ${state}`));
        }
      });
    }
  });
}

export function stopBluetoothBroadcast() {
  bleno.stopAdvertising();
}
