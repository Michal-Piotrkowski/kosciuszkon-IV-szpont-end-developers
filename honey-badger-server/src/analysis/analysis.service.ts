import {
  BadRequestException,
  Logger,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import axios from 'axios';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  getCertInfo(request: Request): Promise<any> {
    const packageName = this.extractPackageName(request.path);

    if (!packageName) {
      throw new BadRequestException('Package name is required');
    }

    this.logger.log(`Fetching npm registry data for ${packageName}`);

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

  private extractPackageName(path: string): string {
    const normalizedPath = path.replace(/^\/+|\/+$/g, '');

    if (!normalizedPath) {
      return '';
    }

    const segments = normalizedPath.split('/');
    const packageSegment = segments[segments.length - 1] ?? '';

    return decodeURIComponent(packageSegment.trim());
  }
}
