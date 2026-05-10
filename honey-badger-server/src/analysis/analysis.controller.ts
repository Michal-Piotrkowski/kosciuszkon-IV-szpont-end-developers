import { Get, Controller, Req, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { AnalysisService } from './analysis.service';
import { EcdsaService } from '../ecdsa/ecdsa.service';
import { PackageManagerService } from '../package-manager/package-manager.service';

@Controller()
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly ecdsaService: EcdsaService,
    private readonly packageManagerService: PackageManagerService,
  ) {}

  @Get('*')
  async inspectRequest(@Req() request: Request): Promise<null> {
    const path = request.path;
    const isTarball = path.endsWith('.tgz');

    try {
      if (isTarball) {
        await this.packageManagerService.handleTarballRequest(path);
      } else {
        await this.packageManagerService.handleMetadataRequest(path);
      }
      return null;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
