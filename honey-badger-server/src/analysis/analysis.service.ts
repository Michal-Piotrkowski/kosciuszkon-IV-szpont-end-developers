import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AnalysisService {
  getCertInfo(packageName: string): Promise<any> {
    return this.fetchFromNpmRegistry(packageName);
  }

  private async fetchFromNpmRegistry(packageName: string): Promise<any> {
    const normalizedPackageName = encodeURIComponent(packageName);
    const url = `https://registry.npmjs.org/${normalizedPackageName}`;

    try {
      const response = await axios.get(url);

      return response.data;
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;

      if (status === 404) {
        throw new NotFoundException(`Package not found: ${packageName}`);
      }

      if (status === 405) {
        throw new BadRequestException(`Invalid package path: ${packageName}`);
      }

      throw error;
    }
  }
}
