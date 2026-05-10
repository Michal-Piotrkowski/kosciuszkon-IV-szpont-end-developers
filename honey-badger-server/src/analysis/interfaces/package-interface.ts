export interface PackageMetadata {
  contributors: string[];
  maintainers: string[];
  time: Record<string, string>;
}

export interface NpmRegistryPackageMetadata {
  contributors?: string[];
  maintainers?: string[];
  time?: Record<string, string>;
}

export interface TarballFileContent {
  name: string;
  content: string;
}

export type PackageRequestKind = 'metadata' | 'tarball';
export type ReportStepStatus = 'ok' | 'skipped' | 'error';

export interface ReportStep {
  name: string;
  status: ReportStepStatus;
  message?: string;
  details?: unknown;
}

export interface ReportError {
  stage: string;
  message: string;
  statusCode?: number;
  details?: unknown;
}

export interface PackageRequestReport {
  kind: PackageRequestKind;
  packageName: string;
  sourceUrl: string;
  proxyBaseUrl?: string;
  steps: ReportStep[];
  fetchedFiles?: string[];
  skippedFiles?: Array<{ name: string; reason: string }>;
  error?: ReportError;
}

export interface PackageRequestResult<T> {
  data: T;
  report: PackageRequestReport;
}
