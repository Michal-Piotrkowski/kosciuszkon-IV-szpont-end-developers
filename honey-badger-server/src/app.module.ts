import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis/analysis.controller';
import { AnalysisService } from './analysis/analysis.service';

@Module({
  imports: [],
  controllers: [AnalysisController],
  providers: [AnalysisService],
})
export class AppModule {}
