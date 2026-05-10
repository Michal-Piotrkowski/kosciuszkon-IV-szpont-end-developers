import { PackageRequestReport } from './interfaces/package-interface';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

export function buildTextReport(report: PackageRequestReport): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  lines.push(
    `${colors.bright}${colors.cyan}HONEY BADGER SECURITY ANALYSIS REPORT${colors.reset}`,
  );
  lines.push(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  lines.push('');

  // Package info
  lines.push(
    `${colors.bright}Package:${colors.reset} ${colors.blue}${report.packageName}${colors.reset}`,
  );
  lines.push(
    `${colors.bright}Type:${colors.reset} ${colors.yellow}${report.kind.toUpperCase()}${colors.reset}`,
  );
  lines.push(
    `${colors.bright}Source:${colors.reset} ${colors.dim}${report.sourceUrl}${colors.reset}`,
  );

  if (report.proxyBaseUrl) {
    lines.push(
      `${colors.bright}Proxy:${colors.reset} ${colors.dim}${report.proxyBaseUrl}${colors.reset}`,
    );
  }

  lines.push('');
  lines.push(
    `${colors.bright}${colors.magenta}${'─'.repeat(80)}${colors.reset}`,
  );

  // Analysis Steps
  lines.push(`${colors.bright}${colors.cyan}ANALYSIS STEPS:${colors.reset}`);
  lines.push('');

  report.steps.forEach((step, idx) => {
    const statusIcon =
      step.status === 'ok'
        ? `${colors.green}✓${colors.reset}`
        : step.status === 'error'
          ? `${colors.red}✗${colors.reset}`
          : `${colors.yellow}⊘${colors.reset}`;

    const stepNum = `${colors.dim}[${String(idx + 1).padStart(2, '0')}]${colors.reset}`;
    const stepName = `${colors.bright}${step.name}${colors.reset}`;
    const message =
      step.status === 'error'
        ? `${colors.red}${step.message || 'Unknown error'}${colors.reset}`
        : `${colors.green}${step.message || 'OK'}${colors.reset}`;

    lines.push(`  ${stepNum} ${statusIcon} ${stepName}`);
    lines.push(`      ${message}`);

    if (step.details) {
      const detailsStr = JSON.stringify(step.details, null, 2);
      detailsStr.split('\n').forEach((line) => {
        lines.push(`      ${colors.dim}${line}${colors.reset}`);
      });
    }
    lines.push('');
  });

  // Error section
  if (report.error) {
    lines.push(
      `${colors.bright}${colors.magenta}${'─'.repeat(80)}${colors.reset}`,
    );
    lines.push(`${colors.bright}${colors.red}ERROR DETAILS:${colors.reset}`);
    lines.push('');
    lines.push(`  ${colors.red}Stage:${colors.reset} ${report.error.stage}`);
    lines.push(
      `  ${colors.red}Message:${colors.reset} ${colors.bright}${report.error.message}${colors.reset}`,
    );

    if (report.error.statusCode) {
      const statusColor =
        report.error.statusCode >= 500
          ? colors.red
          : report.error.statusCode >= 400
            ? colors.yellow
            : colors.green;
      lines.push(
        `  ${colors.red}HTTP Status:${colors.reset} ${statusColor}${report.error.statusCode}${colors.reset}`,
      );
    }

    if (report.error.details) {
      lines.push(`  ${colors.red}Details:${colors.reset}`);
      const detailsStr = JSON.stringify(report.error.details, null, 2);
      detailsStr.split('\n').forEach((line) => {
        lines.push(`    ${colors.dim}${line}${colors.reset}`);
      });
    }
    lines.push('');
  }

  // Files section
  if (report.fetchedFiles && report.fetchedFiles.length > 0) {
    lines.push(
      `${colors.bright}${colors.magenta}${'─'.repeat(80)}${colors.reset}`,
    );
    lines.push(
      `${colors.bright}${colors.green}FETCHED FILES (${report.fetchedFiles.length}):${colors.reset}`,
    );
    lines.push('');
    report.fetchedFiles.slice(0, 10).forEach((file) => {
      lines.push(
        `  ${colors.green}✓${colors.reset} ${colors.dim}${file}${colors.reset}`,
      );
    });
    if (report.fetchedFiles.length > 10) {
      lines.push(
        `  ${colors.dim}... and ${report.fetchedFiles.length - 10} more files${colors.reset}`,
      );
    }
    lines.push('');
  }

  if (report.skippedFiles && report.skippedFiles.length > 0) {
    lines.push(
      `${colors.bright}${colors.magenta}${'─'.repeat(80)}${colors.reset}`,
    );
    lines.push(
      `${colors.bright}${colors.yellow}SKIPPED FILES (${report.skippedFiles.length}):${colors.reset}`,
    );
    lines.push('');
    report.skippedFiles.slice(0, 5).forEach((file) => {
      lines.push(
        `  ${colors.yellow}⊘${colors.reset} ${colors.dim}${file.name}${colors.reset}`,
      );
      lines.push(`      ${colors.dim}Reason: ${file.reason}${colors.reset}`);
    });
    if (report.skippedFiles.length > 5) {
      lines.push(
        `  ${colors.dim}... and ${report.skippedFiles.length - 5} more skipped files${colors.reset}`,
      );
    }
    lines.push('');
  }

  // Summary
  lines.push(
    `${colors.bright}${colors.magenta}${'─'.repeat(80)}${colors.reset}`,
  );

  const totalSteps = report.steps.length;
  const errorSteps = report.steps.filter((s) => s.status === 'error').length;
  const okSteps = report.steps.filter((s) => s.status === 'ok').length;

  const statusLine =
    errorSteps > 0
      ? `${colors.red}FAILED${colors.reset}`
      : `${colors.green}SUCCESS${colors.reset}`;

  lines.push(
    `${colors.bright}Summary:${colors.reset} ${statusLine} (${okSteps}/${totalSteps} steps completed)`,
  );
  lines.push(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  lines.push('');

  return lines.join('\n');
}

export function buildPlainTextReport(report: PackageRequestReport): string {
  // Same as buildTextReport but without ANSI colors for JSON output
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('HONEY BADGER SECURITY ANALYSIS REPORT');
  lines.push('='.repeat(80));
  lines.push('');

  lines.push(`Package: ${report.packageName}`);
  lines.push(`Type: ${report.kind.toUpperCase()}`);
  lines.push(`Source: ${report.sourceUrl}`);

  if (report.proxyBaseUrl) {
    lines.push(`Proxy: ${report.proxyBaseUrl}`);
  }

  lines.push('');
  lines.push('─'.repeat(80));
  lines.push('ANALYSIS STEPS:');
  lines.push('');

  report.steps.forEach((step, idx) => {
    const statusIcon =
      step.status === 'ok' ? '✓' : step.status === 'error' ? '✗' : '⊘';

    lines.push(
      `  [${String(idx + 1).padStart(2, '0')}] ${statusIcon} ${step.name}`,
    );
    lines.push(`      ${step.message || 'OK'}`);

    if (step.details) {
      const detailsStr = JSON.stringify(step.details, null, 2);
      detailsStr.split('\n').forEach((line) => {
        lines.push(`      ${line}`);
      });
    }
    lines.push('');
  });

  if (report.error) {
    lines.push('─'.repeat(80));
    lines.push('ERROR DETAILS:');
    lines.push('');
    lines.push(`  Stage: ${report.error.stage}`);
    lines.push(`  Message: ${report.error.message}`);

    if (report.error.statusCode) {
      lines.push(`  HTTP Status: ${report.error.statusCode}`);
    }

    if (report.error.details) {
      lines.push(`  Details:`);
      const detailsStr = JSON.stringify(report.error.details, null, 2);
      detailsStr.split('\n').forEach((line) => {
        lines.push(`    ${line}`);
      });
    }
    lines.push('');
  }

  if (report.fetchedFiles && report.fetchedFiles.length > 0) {
    lines.push('─'.repeat(80));
    lines.push(`FETCHED FILES (${report.fetchedFiles.length}):`);
    lines.push('');
    report.fetchedFiles.slice(0, 10).forEach((file) => {
      lines.push(`  ✓ ${file}`);
    });
    if (report.fetchedFiles.length > 10) {
      lines.push(`  ... and ${report.fetchedFiles.length - 10} more files`);
    }
    lines.push('');
  }

  if (report.skippedFiles && report.skippedFiles.length > 0) {
    lines.push('─'.repeat(80));
    lines.push(`SKIPPED FILES (${report.skippedFiles.length}):`);
    lines.push('');
    report.skippedFiles.slice(0, 5).forEach((file) => {
      lines.push(`  ⊘ ${file.name}`);
      lines.push(`      Reason: ${file.reason}`);
    });
    if (report.skippedFiles.length > 5) {
      lines.push(
        `  ... and ${report.skippedFiles.length - 5} more skipped files`,
      );
    }
    lines.push('');
  }

  lines.push('─'.repeat(80));

  const totalSteps = report.steps.length;
  const errorSteps = report.steps.filter((s) => s.status === 'error').length;
  const okSteps = report.steps.filter((s) => s.status === 'ok').length;

  const statusLine = errorSteps > 0 ? 'FAILED' : 'SUCCESS';

  lines.push(
    `Summary: ${statusLine} (${okSteps}/${totalSteps} steps completed)`,
  );
  lines.push('='.repeat(80));
  lines.push('');

  return lines.join('\n');
}
