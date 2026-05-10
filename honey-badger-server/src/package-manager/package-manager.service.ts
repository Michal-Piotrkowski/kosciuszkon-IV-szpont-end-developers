import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
  private readonly analysisBlockThreshold = 0.6;

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

      const confidence = this.parseAnalysisConfidence(analysisResult);

      if (confidence >= this.analysisBlockThreshold) {
        throw new ForbiddenException(
          `Package blocked by analysis confidence ${confidence.toFixed(6)} (threshold ${this.analysisBlockThreshold})`,
        );
      }

      const signature = this.ecdsaService.signData(
        packageName,
        JSON.stringify(packageMetadata),
      );

      Logger.log(
        'Package metadata analysis confidence: ' + confidence.toFixed(6),
        PackageManagerService.name,
      );

      const proxyBaseUrl = 'http://localhost:3000';
      const rewrittenData = response.data as any;

      if (rewrittenData.versions) {
        for (const versionKey in rewrittenData.versions) {
          const versionObj = rewrittenData.versions[versionKey];
          if (versionObj.dist && typeof versionObj.dist.tarball === 'string') {
            versionObj.dist.tarball = versionObj.dist.tarball.replace(
              'https://registry.npmjs.org',
              proxyBaseUrl,
            );
          }
        }
      }

      if (rewrittenData.versions) {
        const firstVersionKey = Object.keys(rewrittenData.versions)[0];
        if (firstVersionKey) {
          const sampleTarball =
            rewrittenData.versions[firstVersionKey].dist?.tarball;
          Logger.log(
            `[URL DEBUG] Sending NPM tarball link: ${sampleTarball}`,
            'PackageManagerService',
          );
        }
      }
      return {
        ...rewrittenData,
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

  async handleTarballRequest(packageName: string): Promise<Readable> {
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
              name: header.name,
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

      // Return a new stream from the original URL since we've already consumed the previous one
      const tarballResponse = await axios.get<Readable>(url, {
        responseType: 'stream',
      });

      return tarballResponse.data;
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

  private parseAnalysisConfidence(result: AnalysisResult): number {
    if (typeof result !== 'string' || result.trim() === '') {
      throw new BadRequestException('Invalid analysis result format');
    }

    const confidence = Number(result);

    if (Number.isNaN(confidence) || !Number.isFinite(confidence)) {
      throw new BadRequestException('Invalid analysis confidence value');
    }

    return confidence;
  }
}
