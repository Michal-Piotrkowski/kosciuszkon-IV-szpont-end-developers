import {
  PackageRequestReport,
  ReportStep,
} from './interfaces/package-interface';

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .flatMap((line) => {
      if (line.length <= 100) {
        return [line];
      }

      const chunks: string[] = [];
      for (let index = 0; index < line.length; index += 100) {
        chunks.push(line.slice(index, index + 100));
      }
      return chunks;
    });
}

function formatStep(step: ReportStep): string {
  const details = step.details
    ? ` | details=${JSON.stringify(step.details)}`
    : '';
  const message = step.message ? ` | message=${step.message}` : '';
  return `${step.name} [${step.status}]${message}${details}`;
}

function buildReportLines(report: PackageRequestReport): string[] {
  const lines: string[] = [
    'HoneyBadger Package Report',
    `Kind: ${report.kind}`,
    `Package: ${report.packageName}`,
    `Source: ${report.sourceUrl}`,
  ];

  if (report.proxyBaseUrl) {
    lines.push(`Proxy base URL: ${report.proxyBaseUrl}`);
  }

  lines.push('', 'Steps:');
  for (const step of report.steps) {
    lines.push(`- ${formatStep(step)}`);
  }

  if (report.fetchedFiles && report.fetchedFiles.length > 0) {
    lines.push('', `Fetched files (${report.fetchedFiles.length}):`);
    for (const fileName of report.fetchedFiles) {
      lines.push(`- ${fileName}`);
    }
  }

  if (report.skippedFiles && report.skippedFiles.length > 0) {
    lines.push('', `Skipped files (${report.skippedFiles.length}):`);
    for (const skipped of report.skippedFiles) {
      lines.push(`- ${skipped.name}: ${skipped.reason}`);
    }
  }

  if (report.error) {
    lines.push('', 'Error:');
    lines.push(`- Stage: ${report.error.stage}`);
    lines.push(`- Message: ${report.error.message}`);
    lines.push(`- Status code: ${report.error.statusCode ?? 'n/a'}`);
  }

  return lines;
}

export function buildReportPdfBuffer(report: PackageRequestReport): Buffer {
  const lines = normalizeLines(buildReportLines(report).join('\n'));
  const contentLines = ['BT', '/F1 11 Tf', '50 800 Td'];

  lines.forEach((line, index) => {
    const safeLine = escapePdfText(line);
    if (index === 0) {
      contentLines.push(`(${safeLine}) Tj`);
    } else {
      contentLines.push('T*');
      contentLines.push(`(${safeLine}) Tj`);
    }
  });

  contentLines.push('ET');
  const contentStream = contentLines.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`,
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')];
  const offsets: number[] = [0];
  let size = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(size);
    const objectBuffer = Buffer.from(
      `${index + 1} 0 obj\n${object}\nendobj\n`,
      'utf8',
    );
    chunks.push(objectBuffer);
    size += objectBuffer.length;
  });

  const xrefOffset = size;
  const xrefEntries = ['0000000000 65535 f '];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefEntries.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `);
  }

  const trailer = [
    'xref',
    `0 ${offsets.length}`,
    ...xrefEntries,
    'trailer',
    `<< /Size ${offsets.length} /Root 1 0 R >>`,
    'startxref',
    `${xrefOffset}`,
    '%%EOF',
    '',
  ].join('\n');

  chunks.push(Buffer.from(trailer, 'utf8'));
  return Buffer.concat(chunks);
}
