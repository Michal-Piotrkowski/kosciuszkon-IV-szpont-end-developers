import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis/analysis.controller';
import { AnalysisService } from './analysis/analysis.service';
import { EcdsaService } from './ecdsa/ecdsa.service';
import { PackageManagerService } from './package-manager/package-manager.service';

@Module({
  imports: [],
  controllers: [AnalysisController],
  providers: [AnalysisService, EcdsaService, PackageManagerService],
})
export class AppModule {}
