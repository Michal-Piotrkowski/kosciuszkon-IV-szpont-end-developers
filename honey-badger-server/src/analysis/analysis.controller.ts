import {
  Controller,
  Req,
  Res,
  BadRequestException,
  All,
  Logger,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnalysisService } from './analysis.service';
import { buildReportPdfBuffer } from './pdf-report';
import { buildTextReport, buildPlainTextReport } from './text-report';
import { EcdsaService } from '../ecdsa/ecdsa.service';
import { PackageManagerService } from '../package-manager/package-manager.service';
import { PackageRequestReport } from './interfaces/package-interface';

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
    const reportMode = this.resolveReportMode(request);

    this.logger.log(
      `[INCOMING] Method: ${request.method} | Path: ${path} | isTarball: ${isTarball} | reportMode: ${reportMode}`,
    );

    try {
      if (isTarball) {
        this.logger.log(`Intercepted TARBALL request for: ${path}`);
        const result =
          await this.packageManagerService.handleTarballRequestWithReport(path);

        this.logger.log(
          `[REPORT] ${result.report.packageName} | steps=${result.report.steps.length} | error=${result.report.error?.message ?? 'none'}`,
        );

        if (reportMode === 'text') {
          const text = buildTextReport(result.report);
          response.status(200);
          response.set('Content-Type', 'text/plain; charset=utf-8');
          response.send(text);
          return;
        }

        if (reportMode === 'json') {
          response.status(200).json(result.report);
          return;
        }

        if (reportMode === 'pdf') {
          const pdf = buildReportPdfBuffer(result.report);
          response.status(200);
          response.set('Content-Type', 'application/pdf');
          response.set(
            'Content-Disposition',
            `attachment; filename="${this.buildReportFileName(path)}.pdf"`,
          );
          response.send(pdf);
          return;
        }

        response.set('Content-Type', 'application/gzip');
        response.set(
          'Content-Disposition',
          `inline; filename="${path.split('/').pop()}"`,
        );
        result.data.pipe(response);
      } else {
        this.logger.log(`Intercepted METADATA request for: ${path}`);
        const result =
          await this.packageManagerService.handleMetadataRequestWithReport(
            path,
          );

        this.logger.log(
          `[REPORT] ${result.report.packageName} | steps=${result.report.steps.length} | error=${result.report.error?.message ?? 'none'}`,
        );

        if (reportMode === 'text') {
          const text = buildTextReport(result.report);
          response.status(200);
          response.set('Content-Type', 'text/plain; charset=utf-8');
          response.send(text);
          return;
        }

        if (reportMode === 'json') {
          response.status(200).json(result.report);
          return;
        }

        if (reportMode === 'pdf') {
          const pdf = buildReportPdfBuffer(result.report);
          response.status(200);
          response.set('Content-Type', 'application/pdf');
          response.set(
            'Content-Disposition',
            `attachment; filename="${this.buildReportFileName(path)}.pdf"`,
          );
          response.send(pdf);
          return;
        }

        response.set('Content-Type', 'application/json');
        response.json(result.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const statusCode =
        error instanceof HttpException ? error.getStatus() : 500;

      this.logger.error(
        `Error while processing ${path}: ${message} (HTTP ${statusCode})`,
      );

      const report = this.extractReport(error);

      if (!report) {
        this.logger.error(
          `No report attached to error, returning generic error`,
        );
        if (reportMode === 'text') {
          response.status(statusCode);
          response.set('Content-Type', 'text/plain; charset=utf-8');
          response.send(
            `ERROR: ${message}\n\nNo detailed report available.\nHTTP Status: ${statusCode}`,
          );
          return;
        }

        if (reportMode === 'pdf') {
          response.status(statusCode);
          response.set('Content-Type', 'text/plain; charset=utf-8');
          response.send(`ERROR: ${message}`);
          return;
        }

        if (reportMode === 'json') {
          response.status(statusCode).json({ error: message, statusCode });
          return;
        }

        if (error instanceof HttpException) {
          throw error;
        }

        throw new BadRequestException(message);
      }

      if (reportMode === 'text') {
        const text = buildTextReport(report);
        response.status(statusCode);
        response.set('Content-Type', 'text/plain; charset=utf-8');
        response.send(text);
        return;
      }

      if (reportMode === 'pdf') {
        const pdf = buildReportPdfBuffer(report);
        response.status(statusCode);
        response.set('Content-Type', 'application/pdf');
        response.set(
          'Content-Disposition',
          `attachment; filename="${this.buildReportFileName(path)}.pdf"`,
        );
        response.send(pdf);
        return;
      }

      if (reportMode === 'json') {
        response.status(statusCode).json(report);
        return;
      }

      // Default: return JSON report when error occurs without explicit report mode
      response.status(statusCode).json(report);
    }
  }

  private resolveReportMode(request: Request): 'off' | 'text' | 'json' | 'pdf' {
    const report = request.query.report;
    const reportValue = Array.isArray(report) ? report[0] : report;
    const headerValue = request.headers['x-honeybadger-report'];
    const normalizedHeader = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;
    const normalized = `${reportValue ?? normalizedHeader ?? ''}`
      .trim()
      .toLowerCase();

    if (normalized === 'pdf') {
      return 'pdf';
    }

    if (normalized === 'text' || normalized === 'txt') {
      return 'text';
    }

    if (normalized === '1' || normalized === 'json' || normalized === 'true') {
      return 'json';
    }

    return 'off';
  }

  private extractReport(error: unknown): PackageRequestReport | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const report = (error as { report?: PackageRequestReport }).report;
    return report;
  }

  private buildReportFileName(path: string): string {
    const sanitized = path
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return sanitized || 'report';
  }
}
