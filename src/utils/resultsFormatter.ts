import { ValidationResult, ValidationStatus } from '../types';

/**
 * Format validation status for display
 */
function formatStatus(status: ValidationStatus): string {
  switch (status) {
    case 'supported':
      return 'Supported';
    case 'partial':
      return 'Partially Supported';
    case 'not_supported':
      return 'Not Supported';
    default:
      return 'Unknown';
  }
}

/**
 * Format a single validation result as Markdown
 */
function formatSingleResult(result: ValidationResult): string {
  const lines: string[] = [];

  // Header with citation key
  lines.push(`## @${result.citation.key}`);
  lines.push('');

  // Status and confidence
  lines.push(`**Status**: ${formatStatus(result.status)}`);
  lines.push(`**Confidence**: ${Math.round(result.confidence * 100)}%`);
  lines.push('');

  // Explanation
  lines.push('### Explanation');
  lines.push(result.explanation);
  lines.push('');

  // Paper metadata (if available)
  if (result.paper) {
    lines.push('### Paper Metadata');
    if (result.paper.title) {
      lines.push(`- **Title**: ${result.paper.title}`);
    }
    if (result.paper.author) {
      lines.push(`- **Author**: ${result.paper.author}`);
    }
    if (result.paper.year) {
      lines.push(`- **Year**: ${result.paper.year}`);
    }
    if (result.paper.journal) {
      lines.push(`- **Journal**: ${result.paper.journal}`);
    }
    if (result.paper.doi) {
      lines.push(`- **DOI**: ${result.paper.doi}`);
    }
    if (result.paper.url) {
      lines.push(`- **URL**: ${result.paper.url}`);
    }
    lines.push('');
  }

  // Abstract (if available)
  if (result.paper?.abstract) {
    lines.push('### Abstract');
    lines.push(result.paper.abstract);
    lines.push('');
  }

  // Supporting quotes
  if (result.supportingQuotes && result.supportingQuotes.length > 0) {
    lines.push('### Supporting Quotes');
    result.supportingQuotes.forEach((quote, index) => {
      const pageRef = quote.page ? ` (p. ${quote.page})` : '';
      lines.push(`${index + 1}. "${quote.text}"${pageRef}`);
    });
    lines.push('');
  }

  // Rephrase suggestion (if available)
  if (result.rephrase) {
    lines.push('### Rephrase Suggestion');
    lines.push(result.rephrase);
    lines.push('');
  }

  // Separator
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format all validation results as Markdown
 *
 * @param results - Array of validation results sorted by document position
 * @returns Formatted Markdown string
 */
export function formatResultsAsMarkdown(results: ValidationResult[]): string {
  if (results.length === 0) {
    return '# Citation Validation Results\n\nNo validated citations found.';
  }

  const lines: string[] = [];

  // Header
  lines.push('# Citation Validation Results');
  lines.push('');

  // Summary
  const supported = results.filter((r) => r.status === 'supported').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const notSupported = results.filter((r) => r.status === 'not_supported').length;

  lines.push('## Summary');
  lines.push(`- **Total Citations**: ${results.length}`);
  lines.push(`- **Supported**: ${supported}`);
  lines.push(`- **Partially Supported**: ${partial}`);
  lines.push(`- **Not Supported**: ${notSupported}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Individual results
  for (const result of results) {
    lines.push(formatSingleResult(result));
  }

  return lines.join('\n');
}
