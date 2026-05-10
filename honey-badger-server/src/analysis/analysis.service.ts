import { Logger, Injectable } from '@nestjs/common';
import * as path from 'path';
import { spawn } from 'child_process';
import { EcdsaService } from '../ecdsa/ecdsa.service';
import {
  PackageMetadata,
  TarballFileContent,
} from './interfaces/package-interface';

export type AnalysisResult = string | null;
@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly olamaModelPath = path.join(
    process.cwd(),
    'src/analysis/model.py',
  );

  private readonly bertModelPath = path.join(
    process.cwd(),
    'src/analysis/model.py',
  );

  constructor(private ecdsaService: EcdsaService) {}

  analyzePackageMetadata(metadata: PackageMetadata): Promise<AnalysisResult> {
    return this.runModel(metadata, this.bertModelPath);
  }

  analyzePackageTarball(files: TarballFileContent[]): Promise<AnalysisResult> {
    return this.runModel(
      {
        kind: 'tarball',
        files,
      },
      this.olamaModelPath,
    );
  }

  private runModel(
    payload: unknown,
    modelPath: string,
  ): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('python', [modelPath]);
      let stdout = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        this.logger.error(`Model stderr: ${data.toString()}`);
      });

      child.on('error', (error) => {
        this.logger.error(`Spawn error: ${error.message}`);
        reject(error);
      });

      child.on('close', (code) => {
        this.logger.log(`Model process exited with code ${code}`);

        if (code !== 0) {
          reject(new Error(`Python model exited with code ${code}`));
          return;
        }

        resolve(stdout.trim() || null);
      });

      child.stdin?.end(JSON.stringify(payload));
    });
  }
}
