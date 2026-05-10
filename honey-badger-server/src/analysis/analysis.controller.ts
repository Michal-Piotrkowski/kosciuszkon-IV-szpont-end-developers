import {
  Controller,
  Req,
  Res,
  BadRequestException,
  All,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnalysisService } from './analysis.service';
import { EcdsaService } from '../ecdsa/ecdsa.service';
import { PackageManagerService } from '../package-manager/package-manager.service';

@Controller()
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly ecdsaService: EcdsaService,
    private readonly packageManagerService: PackageManagerService,
  ) {}

  @All('*')
  async inspectRequest(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const path = request.path;
    const isTarball = path.endsWith('.tgz');

    this.logger.log(
      `[INCOMING] Method: ${request.method} | Path: ${path} | isTarball: ${isTarball}`,
    );

    try {
      if (isTarball) {
        this.logger.log(`Intercepted TARBALL request for: ${path}`);
        const tarballStream =
          await this.packageManagerService.handleTarballRequest(path);
        response.set('Content-Type', 'application/gzip');
        response.set(
          'Content-Disposition',
          `inline; filename="${path.split('/').pop()}"`,
        );
        tarballStream.pipe(response);
      } else {
        this.logger.log(`Intercepted METADATA request for: ${path}`);
        const metadata =
          await this.packageManagerService.handleMetadataRequest(path);
        response.set('Content-Type', 'application/json');
        response.json(metadata);
      }
    } catch (error) {
      this.logger.error(`Błąd podczas przetwarzania ${path}: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }
}
