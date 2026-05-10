import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { AnalysisResult, AnalysisService } from '../analysis/analysis.service';
import {
  NpmRegistryPackageMetadata,
  PackageMetadata,
  PackageRequestReport,
  PackageRequestResult,
  TarballFileContent,
} from '../analysis/interfaces/package-interface';
import { EcdsaService } from '../ecdsa/ecdsa.service';
import tar from 'tar-stream';
import { Readable } from 'node:stream';
import { createGunzip } from 'zlib';

@Injectable()
export class PackageManagerService {
  private readonly logger = new Logger(PackageManagerService.name);
  private readonly npmRegistryUrl = 'https://registry.npmjs.org';
  private readonly analysisBlockThreshold = Number(
    process.env.ANALYSIS_BLOCK_THRESHOLD ?? '0.6',
  );
  private readonly allowBypass =
    (process.env.PACKAGE_MANAGER_BYPASS ?? 'false').toLowerCase() === 'true' ||
    (process.env.PACKAGE_MANAGER_BYPASS ?? '0') === '1';

  private readonly proxyBaseUrl =
    process.env.PROXY_BASE_URL ?? 'http://localhost:3000';

  constructor(
    private analysisService: AnalysisService,
    private ecdsaService: EcdsaService,
  ) {}

  async handleMetadataRequest(packageName: string): Promise<unknown> {
    const result = await this.handleMetadataRequestWithReport(packageName);
    return result.data;
  }

  async handleMetadataRequestWithReport(
    packageName: string,
  ): Promise<PackageRequestResult<unknown>> {
    const url = `${this.npmRegistryUrl}${packageName}`;
    const report = this.createReport('metadata', packageName, url);

    try {
      report.steps.push({
        name: 'registry_fetch',
        status: 'ok',
        message: `Fetching metadata from ${url}`,
      });

      const response = await axios.get<NpmRegistryPackageMetadata>(url);

      if (!response.data) {
        throw new NotFoundException(`Package not found: ${packageName}`);
      }

      const packageMetadata: PackageMetadata = {
        contributors: response.data.contributors ?? [],
        maintainers: response.data.maintainers ?? [],
        time: response.data.time ?? {},
      };

      report.steps.push({
        name: 'metadata_normalize',
        status: 'ok',
        message: 'Normalized registry metadata into analysis payload',
      });

      const analysisResult: AnalysisResult =
        await this.analysisService.analyzePackageMetadata(packageMetadata);

      // attach analysis raw output to report (parsed if possible)
      let parsedAnalysis: unknown = analysisResult;
      try {
        if (typeof analysisResult === 'string') {
          parsedAnalysis = JSON.parse(analysisResult as string);
        }
      } catch (e) {
        // leave parsedAnalysis as raw string if JSON parse fails
        parsedAnalysis = analysisResult;
      }

      const confidence = this.parseAnalysisConfidence(analysisResult);

      report.steps.push({
        name: 'metadata_analysis',
        status: 'ok',
        message: `Analysis confidence: ${confidence.toFixed(6)}`,
        details: parsedAnalysis,
      });

      if (confidence >= this.analysisBlockThreshold) {
        if (!this.allowBypass) {
          report.steps.push({
            name: 'policy_check',
            status: 'error',
            message: `Blocked by confidence threshold ${this.analysisBlockThreshold}`,
          });
          throw new ForbiddenException(
            `Package blocked by analysis confidence ${confidence.toFixed(6)} (threshold ${this.analysisBlockThreshold})`,
          );
        } else {
          report.steps.push({
            name: 'policy_check',
            status: 'skipped',
            message: `Policy check would have blocked this package (confidence=${confidence.toFixed(6)}), but bypass is enabled`,
            details: { threshold: this.analysisBlockThreshold, confidence },
          });
        }
      }

      const signature = this.ecdsaService.signData(
        packageName,
        JSON.stringify(packageMetadata),
      );

      report.steps.push({
        name: 'signing',
        status: 'ok',
        message: 'Signed metadata payload',
      });

      const rewrittenData = response.data as any;
      let rewrittenCount = 0;

      if (rewrittenData.versions) {
        for (const versionKey in rewrittenData.versions) {
          const versionObj = rewrittenData.versions[versionKey];
          if (versionObj.dist && typeof versionObj.dist.tarball === 'string') {
            versionObj.dist.tarball = versionObj.dist.tarball.replace(
              'https://registry.npmjs.org',
              this.proxyBaseUrl,
            );
            rewrittenCount += 1;
          }
        }
      }

      report.proxyBaseUrl = this.proxyBaseUrl;
      report.steps.push({
        name: 'tarball_rewrite',
        status: 'ok',
        message: `Rewrote ${rewrittenCount} tarball URL(s) to local proxy`,
        details: { rewrittenCount },
      });

      if (rewrittenData.versions) {
        const firstVersionKey = Object.keys(rewrittenData.versions)[0];
        if (firstVersionKey) {
          const sampleTarball =
            rewrittenData.versions[firstVersionKey].dist?.tarball;
          this.logger.log(`[URL DEBUG] Sample tarball URL: ${sampleTarball}`);
        }
      }
      this.logReportSummary(report);

      return {
        data: { ...rewrittenData, signature },
        report,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, packageName, url);
      this.failReport(report, normalized);
      this.logReportSummary(report);
      throw this.attachReport(normalized, report);
    }
  }

  async handleTarballRequest(packageName: string): Promise<Readable> {
    const result = await this.handleTarballRequestWithReport(packageName);
    return result.data;
  }

  async handleTarballRequestWithReport(
    packageName: string,
  ): Promise<PackageRequestResult<Readable>> {
    const url = `${this.npmRegistryUrl}${packageName}`;
    const report = this.createReport('tarball', packageName, url);
    const fetchedFiles: string[] = [];
    const skippedFiles: Array<{ name: string; reason: string }> = [];

    try {
      report.steps.push({
        name: 'registry_fetch',
        status: 'ok',
        message: `Fetching tarball from ${url}`,
      });

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
            skippedFiles.push({
              name: header.name,
              reason: `Skipped non-file entry (${header.type})`,
            });
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
            fetchedFiles.push(header.name);
            next();
          });

          stream.resume();
        });

        extract.on('finish', resolve);

        response.data.pipe(gunzip).pipe(extract);
      });

      report.steps.push({
        name: 'tarball_extract',
        status: 'ok',
        message: `Extracted ${files.length} file(s) from tarball`,
        details: { extractedFiles: files.length },
      });

      report.fetchedFiles = fetchedFiles;
      report.skippedFiles = skippedFiles;

      const tarAnalysisRaw =
        await this.analysisService.analyzePackageTarball(files);

      // attempt to parse JSON result from the model
      let tarAnalysisParsed: unknown = tarAnalysisRaw;
      try {
        if (typeof tarAnalysisRaw === 'string') {
          tarAnalysisParsed = JSON.parse(tarAnalysisRaw as string);
        }
      } catch (e) {
        tarAnalysisParsed = tarAnalysisRaw;
      }

      report.steps.push({
        name: 'tarball_analysis',
        status: 'ok',
        message: `Analyzed ${files.length} extracted file(s) with model`,
        details: tarAnalysisParsed,
      });

      // Return a new stream from the original URL since we've already consumed the previous one
      const tarballResponse = await axios.get<Readable>(url, {
        responseType: 'stream',
      });

      report.steps.push({
        name: 'tarball_refetch',
        status: 'ok',
        message: 'Refetched tarball stream for npm client response',
      });

      this.logReportSummary(report);

      return {
        data: tarballResponse.data,
        report,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, packageName, url);
      this.failReport(report, normalized);
      report.fetchedFiles = fetchedFiles;
      report.skippedFiles = skippedFiles;
      this.logReportSummary(report);
      throw this.attachReport(normalized, report);
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

  private createReport(
    kind: PackageRequestReport['kind'],
    packageName: string,
    sourceUrl: string,
  ): PackageRequestReport {
    return {
      kind,
      packageName,
      sourceUrl,
      steps: [],
    };
  }

  private failReport(report: PackageRequestReport, error: Error): void {
    report.error = {
      stage:
        report.steps.length > 0
          ? report.steps[report.steps.length - 1].name
          : 'unknown',
      message: error.message,
      statusCode:
        error instanceof NotFoundException
          ? 404
          : error instanceof BadRequestException
            ? 400
            : error instanceof ForbiddenException
              ? 403
              : error instanceof BadGatewayException
                ? 502
                : 500,
    };

    report.steps.push({
      name: 'request_failed',
      status: 'error',
      message: error.message,
      details: report.error,
    });
  }

  private normalizeError(
    error: unknown,
    packageName: string,
    url: string,
  ): Error {
    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof BadGatewayException ||
      error instanceof InternalServerErrorException
    ) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(
        `Axios error for ${url}: status=${status}, message=${error.message}, data=${JSON.stringify(responseData)}`,
      );
      if (status === 404) {
        return new NotFoundException(`Package not found: ${packageName}`);
      }
      if (status === 405) {
        return new BadRequestException(`Invalid package path: ${packageName}`);
      }
      return new BadGatewayException(
        `Upstream request failed for ${url}${status ? ` (HTTP ${status})` : ''}`,
      );
    }

    if (error instanceof Error) {
      this.logger.error(
        `Generic error for ${packageName}: ${error.name} - ${error.message}`,
        error.stack,
      );
      return new InternalServerErrorException(error.message);
    }

    this.logger.error(
      `Unknown error for ${packageName}: ${JSON.stringify(error)}`,
    );
    return new InternalServerErrorException('Unknown package manager error');
  }

  private attachReport<T extends Error>(
    error: T,
    report: PackageRequestReport,
  ): T {
    (error as T & { report?: PackageRequestReport }).report = report;
    return error;
  }

  private logReportSummary(report: PackageRequestReport): void {
    this.logger.log(
      `[REPORT] ${report.kind.toUpperCase()} ${report.packageName} | steps=${report.steps.length} | error=${report.error?.message ?? 'none'}`,
    );
    this.logger.verbose(JSON.stringify(report, null, 2));
  }
}
