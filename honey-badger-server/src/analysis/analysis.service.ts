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
  private readonly pythonExecutable = process.env.PYTHON_EXECUTABLE ?? 'python';
  private readonly olamaModelPath = path.join(
    process.cwd(),
    'src/analysis/olama_code_analysis.py',
  );

  private readonly bertModelPath = path.join(
    process.cwd(),
    '../HoneyBadger/check_npm_stdio.py',
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
      const child = spawn(this.pythonExecutable, [modelPath], {
        env: {
          ...process.env,
          OLLAMA_HOST: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
          OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? 'llama3:latest',
        },
      });
      let stdout = '';
      let stderr = '';

      this.logger.log(
        `Running model script: ${path.basename(modelPath)} using ${this.pythonExecutable}`,
      );

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        this.logger.error(`Spawn error: ${error.message}`);
        reject(error);
      });

      child.on('close', (code) => {
        this.logger.log(`Model process exited with code ${code}`);

        if (code !== 0) {
          if (stderr.trim()) {
            this.logger.error(`Model stderr: ${stderr.trim()}`);
          }
          reject(new Error(`Python model exited with code ${code}`));
          return;
        }

        const output = stdout.trim();
        if (output) {
          this.logger.log(`Model stdout: ${output}`);
        } else {
          this.logger.warn('Model stdout was empty');
        }

        if (stderr.trim()) {
          this.logger.verbose(`Model stderr: ${stderr.trim()}`);
        }

        resolve(output || null);
      });

      child.stdin?.end(JSON.stringify(payload));
    });
  }
}
