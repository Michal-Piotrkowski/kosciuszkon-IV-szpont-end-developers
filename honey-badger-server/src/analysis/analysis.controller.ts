import { All, Controller, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AnalysisService } from './analysis.service';

@Controller()
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @All('*')
  async inspectRequest(@Req() request: Request): Promise<any> {
    return await this.analysisService.getCertInfo(request);
  }
}
