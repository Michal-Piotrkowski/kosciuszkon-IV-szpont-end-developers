import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { AnalysisResult, AnalysisService } from '../analysis/analysis.service';
import {
  NpmRegistryPackageMetadata,
  PackageMetadata,
  TarballFileContent,
} from '../analysis/interfaces/package-interface';
import { EcdsaService } from '../ecdsa/ecdsa.service';
import tar from 'tar-stream';
import { Readable } from 'node:stream';
import { createGunzip } from 'zlib';

@Injectable()
export class PackageManagerService {
  private readonly npmRegistryUrl = 'https://registry.npmjs.org';

  constructor(
    private analysisService: AnalysisService,
    private ecdsaService: EcdsaService,
  ) {}

  async handleMetadataRequest(packageName: string): Promise<unknown> {
    const url = `${this.npmRegistryUrl}${packageName}`;

    try {
      const response = await axios.get<NpmRegistryPackageMetadata>(url);

      if (!response.data) {
        throw new NotFoundException(`Package not found: ${packageName}`);
      }

      const packageMetadata: PackageMetadata = {
        contributors: response.data.contributors ?? [],
        maintainers: response.data.maintainers ?? [],
        time: response.data.time ?? {},
      };

      const analysisResult: AnalysisResult =
        await this.analysisService.analyzePackageMetadata(packageMetadata);

      const validation = this.validateAnalysisResult(analysisResult);

      if (!validation) {
        return { warning: 'Package may be unsafe based on analysis results' };
      }

      const signature = this.ecdsaService.signData(
        packageName,
        JSON.stringify(packageMetadata),
      );

      return {
        ...response.data,
        signature,
      };
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

  async handleTarballRequest(packageName: string): Promise<unknown> {
    const url = `${this.npmRegistryUrl}${packageName}`;

    try {
      const response = await axios.get<Readable>(url, {
        responseType: 'stream',
      });
      const gunzip = createGunzip();
      const extract = tar.extract();
      const files: TarballFileContent[] = [];

      await new Promise<void>((resolve, reject) => {
        response.data.on('error', reject);
        gunzip.on('error', reject);
        extract.on('error', reject);

        extract.on('entry', (header, stream, next) => {
          if (header.type !== 'file') {
            stream.resume();
            stream.on('end', next);
            return;
          }

          const chunks: Buffer[] = [];

          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          stream.on('end', () => {
            files.push({
              fileName: header.name,
              content: Buffer.concat(chunks).toString('utf8'),
            });
            next();
          });

          stream.resume();
        });

        extract.on('finish', resolve);

        response.data.pipe(gunzip).pipe(extract);
      });

      await this.analysisService.analyzePackageTarball(files);

      return {
        processedFiles: files.length,
      };
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

  private validateAnalysisResult(result: AnalysisResult): boolean {
    if (typeof result !== 'string' && result !== null) {
      throw new BadRequestException('Invalid analysis result format');
    } else {
      return result === '1';
    }
  }
}
