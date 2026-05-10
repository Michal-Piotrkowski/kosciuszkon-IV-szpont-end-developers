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
