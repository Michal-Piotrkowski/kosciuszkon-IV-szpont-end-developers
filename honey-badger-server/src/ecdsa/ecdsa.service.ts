import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class EcdsaService {
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },

      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return { publicKey, privateKey };
  }

  signData(packageName: string, data: string): string {
    const { privateKey } = this.generateKeyPair();
    const sign = crypto.sign(null, Buffer.from(`${packageName}:${data}`), {
      key: privateKey,
    });

    const signature = sign.toString('base64');
    return signature;
  }

  verifySignature() {}
}
