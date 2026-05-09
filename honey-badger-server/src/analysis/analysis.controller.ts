import {
  All,
  BadRequestException,
  Controller,
  Logger,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AnalysisService } from './analysis.service';

@Controller()
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(private readonly analysisService: AnalysisService) {}

  @All('*')
  async inspectRequest(@Req() request: Request) {
    const packageName = this.extractPackageName(request.path);

    if (!packageName) {
      throw new BadRequestException('Package name is required');
    }

    this.logger.log(`Fetching npm registry data for ${packageName}`);

    return this.analysisService.getCertInfo(packageName);
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
